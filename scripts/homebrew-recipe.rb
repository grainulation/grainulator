# Registered/trusted formula, candidate archives already verified by Node.
# Every writable prefix, dependency shim and host registration below is disposable.
require "tmpdir"
require "digest"
require "json"
require "open3"
Utils::GemSetup.install_bundler_gems!(groups: ["formula_test"], setup_path: false)
require "formula_assertions"
raise "expected eight arguments" unless ARGV.length == 8
name, formula_path, source, native, manifest_dir, node, pin, archive = ARGV
formula_path = Pathname(formula_path).realpath
source, native, manifest_dir, node, archive = [source, native, manifest_dir, node, archive].map { |p| Pathname(p).realpath }
manifest_bytes = (manifest_dir/"release-manifest.json").binread
raise "manifest pin mismatch" unless Digest::SHA256.hexdigest(manifest_bytes) == pin
manifest = JSON.parse(manifest_bytes)
target = JSON.parse((native/"runtime-asset.json").read).fetch("target")
record = manifest.fetch("assets").find { |a| a.fetch("target") == target }
raise "native archive differs" unless archive.size == record.fetch("bytes") && Digest::SHA256.file(archive).hexdigest == record.fetch("sha256")
node_version, node_error, node_status = Open3.capture3(node.to_s, "--version")
raise "supplied Node24 dependency is unavailable: #{node_error}" unless node_status.success? && node_version.start_with?("v24.")
Dir.mktmpdir("grainulator-recipe-") do |temporary|
  temp = Pathname(temporary).realpath
  prefix_path = temp/"prefix"
  prefix_path.mkpath
  prefix_path = prefix_path.realpath
  # The generated wrapper uses a disposable absolute Node launcher. Removing this
  # shim tests runtime independence without touching the real NVM/Brew executable.
  dependency = temp/"node-dependency"
  node_bin = dependency/"bin"
  node_bin.mkpath
  node_bin = node_bin.realpath
  File.open(node_bin/"node", File::WRONLY|File::CREAT|File::EXCL, 0755) do |file|
    file.write("#!/bin/sh\nexec #{node.to_s.shellescape} \"$@\"\n")
  end
  formula = Formulary.factory(name, :stable)
  raise "wrong registered formula" unless formula.name == "grainulator" && formula.path.realpath == formula_path
  raise "base checksum differs" unless formula.stable.checksum.to_s == manifest.fetch("base").fetch("sha256")
  raise "runtime checksum differs" unless formula.resource("native-runtime").checksum.to_s == record.fetch("sha256")
  raise "release pin differs" unless formula.resource("release-manifest").checksum.to_s == pin
  raise "Node24 must be declared" unless formula.deps.any? { |d| d.name == "node@24" && !d.build? }
  formula.extend(Homebrew::Assertions)
  formula.build = BuildOptions.new(Options.create([]), formula.options)
  formula.define_singleton_method(:prefix) { |*_args| prefix_path }
  formula.define_singleton_method(:opt_prefix) { prefix_path }
  formula.buildpath = source
  formula.resource("native-runtime").define_singleton_method(:stage) { |&block| Dir.chdir(native, &block) }
  formula.resource("release-manifest").define_singleton_method(:stage) { |&block| Dir.chdir(manifest_dir, &block) }
  node_formula = Struct.new(:opt_bin).new(node_bin)
  original_lookup = Formula.method(:[])
  Formula.define_singleton_method(:[]) { |formula_name| formula_name == "node@24" ? node_formula : original_lookup.call(formula_name) }
  begin
    ENV.activate_extensions!(env: "std")
    Dir.chdir(source) { formula.install }
    wrapper = formula.bin/"grainulator"
    raise "missing wrapper" unless wrapper.executable?
    raise "wrapper does not select the keg asset" unless wrapper.read.include?("GRAINULATOR_RUNTIME_ASSET_DIR=#{(formula.libexec/"native").to_s.shellescape}")
    formula.run_test

    home = temp/"private-home"
    workspace = temp/"enrolled-workspace"
    config = temp/"private-codex"
    [home, workspace].each(&:mkpath)
    home, workspace = [home, workspace].map(&:realpath)
    private_env = {
      "HOME" => home.to_s, "XDG_CONFIG_HOME" => (home/".config").to_s,
      "GRAINULATOR_CONFIG" => nil, "GRAINULATOR_WORKSPACE" => nil,
      "CLAUDE_PROJECT_DIR" => nil, "GRAINULATOR_RUNTIME_ASSET_DIR" => nil
    }
    invoke = lambda do |*argv|
      output, error, status = Open3.capture3(private_env, wrapper.to_s, *argv.map(&:to_s), chdir: workspace.to_s)
      raise "Brew wrapper command failed (#{argv.first(2).join(' ')}): #{error}\n#{output}" unless status.success?
      JSON.parse(output)
    end
    installed = invoke.call("runtime", "install", "--archive", archive, "--manifest", formula.libexec/"release/release-manifest.json", "--manifest-sha256", pin, "--json")
    invoke.call("runtime", "init", "--dir", workspace, "--json")
    checked = invoke.call("runtime", "check", "--dir", workspace, "--json", "--no-state")
    raise "new native fixture is not ready" unless checked.fetch("status") == "ready"
    enrolled = invoke.call("runtime", "enroll", "--dir", workspace, "--host", "codex", "--config-dir", config, "--settings-sha256", "absent", "--json")
    retained = Pathname(enrolled.fetch("asset_directory")).realpath
    expected = home/".grainulator/runtime/bin"/manifest.fetch("version")/target
    raise "Brew enrollment did not select the retained user cache" unless retained == expected.realpath && retained.to_s == installed.fetch("asset_directory")
    raise "enrollment falsely claims host discovery" unless enrolled.fetch("host_verified") == false

    # Simulate package cleanup/removal using only this owned temporary prefix and
    # dependency shim. The actual supplied Node binary is never moved or deleted.
    prefix_path.rename(temp/"removed-keg")
    dependency.rename(temp/"removed-node-dependency")
    raise "disposable CLI/Node paths still exist" if wrapper.exist? || (node_bin/"node").exist?
    hook = retained/"grainulator-runtime-hook"
    hook_env = private_env.merge("PATH" => "/nonexistent")
    run_hook = lambda do |project|
      output, error, status = Open3.capture3(hook_env, hook.to_s, "--required", stdin_data: JSON.generate({cwd: project.to_s}), chdir: workspace.to_s)
      raise "retained native hook failed: #{error}" unless status.success?
      output
    end
    raise "retained native hook cannot allow ready workspace without Brew/Node" unless run_hook.call(workspace).empty?
    raise "required hook allowed an unknown root" unless JSON.parse(run_hook.call(temp)).fetch("decision") == "block"
    (retained/"grainulator-runtime-check").rename(retained/"removed-checker")
    raise "required hook allowed a missing checker" unless JSON.parse(run_hook.call(workspace)).fetch("decision") == "block"
    puts "PASS: actual Grainulator Homebrew recipe, isolated prefix and credential-free installed tests"
    puts "PASS: real Brew wrapper enrollment retains its native gate after disposable keg and Node launcher removal"
  ensure
    Formula.define_singleton_method(:[], original_lookup)
  end
end
