#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NATIVE_TARGETS, readRegular, sha256 } from "../lib/runtime-assets.js";

export function renderFormula({
	manifest: manifestFile,
	manifestSha256,
	artifactDirectory,
}) {
	const manifestBytes = readRegular(path.resolve(manifestFile), 1024 * 1024);
	if (
		!/^[a-f0-9]{64}$/.test(manifestSha256 || "") ||
		sha256(manifestBytes) !== manifestSha256
	)
		throw Error("Manifest must match independently reviewed SHA-256");
	const m = JSON.parse(manifestBytes);
	if (
		m.schema !== "grainulator.release.v1" ||
		!/^3\.\d+\.\d+$/.test(m.version) ||
		!/^[a-f0-9]{40}$/.test(m.source_commit)
	)
		throw Error("Invalid release identity");
	if (
		!m.base ||
		m.base.filename !== "grainulator-" + m.version + ".tgz" ||
		m.assets?.length !== 4 ||
		new Set(m.assets.map((a) => a.target)).size !== 4 ||
		m.assets.some((a) => !NATIVE_TARGETS.includes(a.target))
	)
		throw Error("Complete canonical base and four native candidates required");
	for (const a of [m.base, ...m.assets]) {
		if (
			path.basename(a.filename) !== a.filename ||
			!/^[a-f0-9]{64}$/.test(a.sha256) ||
			!Number.isSafeInteger(a.bytes) ||
			a.bytes <= 0
		)
			throw Error("Invalid candidate identity");
		const bytes = readRegular(
			path.join(path.resolve(artifactDirectory), a.filename),
		);
		if (bytes.length !== a.bytes || sha256(bytes) !== a.sha256)
			throw Error("Candidate bytes differ from manifest");
	}
	const url =
		"https://github.com/grainulation/grainulator/releases/download/v" +
		m.version +
		"/";
	const lines = [
		"class Grainulator < Formula",
		'  desc "Evidence and verified execution tools for model-assisted work"',
		'  homepage "https://grainulator.dev"',
		'  license "MIT"',
		"  # Frozen source commit: " + m.source_commit,
		"  # Generate only from independently reviewed, passing candidate bytes.",
		'  url "' + url + m.base.filename + '"',
		'  sha256 "' + m.base.sha256 + '"',
		'  version "' + m.version + '"',
		"  # v3 supports tested Node 24/26 LTS; pin the minimum supported LTS for this channel.",
		'  depends_on "node@24"',
		"  # The wrapper selects Node explicitly; preserve manifest-verified application bytes.",
		'  skip_clean "libexec/app"',
		"",
		'  resource "release-manifest" do',
		'    url "' + url + 'release-manifest.json"',
		'    sha256 "' + manifestSha256 + '"',
		"  end",
		"",
	];
	for (const [os, platform] of [
		["apple-darwin", "macos"],
		["unknown-linux-musl", "linux"],
	]) {
		lines.push("  on_" + platform + " do");
		for (const [cpu, arch] of [
			["aarch64", "arm"],
			["x86_64", "intel"],
		]) {
			const a = m.assets.find((a) => a.target === cpu + "-" + os);
			if (
				a.filename !==
					"grainulator-runtime-" + m.version + "-" + a.target + ".tar.gz" ||
				!/^[a-f0-9]{64}$/.test(a.metadata_sha256 || "")
			)
				throw Error("Noncanonical native release record");
			lines.push(
				"    on_" + arch + " do",
				'      resource "native-runtime" do',
				'        url "' + url + a.filename + '"',
				'        sha256 "' + a.sha256 + '"',
				"      end",
				"    end",
			);
		}
		lines.push("  end", "");
	}
	lines.push(
		"  def install",
		'    (libexec/"app").install Dir.children(".")',
		'    resource("native-runtime").stage { (libexec/"native").install Dir.children(".") }',
		'    resource("release-manifest").stage { (libexec/"release").install "release-manifest.json" }',
		'    manifest_bytes = (libexec/"release/release-manifest.json").binread',
		"    manifest = JSON.parse(manifest_bytes)",
		'    target = (libexec/"native/runtime-asset.json").read.then { |value| JSON.parse(value).fetch("target") }',
		'    asset = manifest.fetch("assets").find { |item| item.fetch("target") == target }',
		'    receipt = { schema: "grainulator.runtime.install.v1", manifest_sha256: "' +
			manifestSha256 +
			'",',
		'                manifest: [manifest_bytes].pack("m0"), archive_sha256: asset.fetch("sha256") }',
		'    (libexec/"native/.install-receipt.json").write JSON.generate(receipt) + "\\n"',
		"    bin.mkpath",
		'    (bin/"grainulator").write <<~SH, perm: 0755',
		"      #!/bin/sh",
		"      GRAINULATOR_INSTALL_ORIGIN=homebrew",
		'      GRAINULATOR_HOMEBREW_LAUNCHER=#{(opt_bin/"grainulator").to_s.shellescape}',
		'      GRAINULATOR_RUNTIME_ASSET_DIR=#{(libexec/"native").to_s.shellescape}',
		"      export GRAINULATOR_INSTALL_ORIGIN GRAINULATOR_HOMEBREW_LAUNCHER GRAINULATOR_RUNTIME_ASSET_DIR",
		'      exec #{(Formula["node@24"].opt_bin/"node").to_s.shellescape} #{(libexec/"app/bin/grainulator.js").to_s.shellescape} "$@"',
		"    SH",
		"    # Completion/manual assets, when shipped, use Homebrew locations; no shell profile edits.",
		'    bash_completion.install_symlink libexec/"app/share/completions/grainulator.bash" => "grainulator"',
		'    zsh_completion.install_symlink libexec/"app/share/completions/grainulator.zsh" => "_grainulator"',
		'    fish_completion.install_symlink libexec/"app/share/completions/grainulator.fish"',
		'    man1.install_symlink libexec/"app/share/man/man1/grainulator.1"',
		"  end",
		"",
		"  test do",
		'    assert_path_exists bash_completion/"grainulator"',
		'    assert_path_exists zsh_completion/"_grainulator"',
		'    assert_path_exists fish_completion/"grainulator.fish"',
		'    assert_path_exists man1/"grainulator.1"',
		"    %w[share/completions/grainulator.bash share/completions/grainulator.zsh share/completions/grainulator.fish share/man/man1/grainulator.1].each do |file|",
		'      assert_path_exists libexec/"app"/file',
		"    end",
		'    system bin/"grainulator", "doctor", "--json"',
		'    system bin/"grainulator", "demo", "--dir", testpath/"demo", "--json"',
		'    system bin/"grainulator", "init", "--dir", testpath/"sprint", "--question", "Installed artifact check", "--json"',
		'    system bin/"grainulator", "compile", "--dir", testpath/"sprint", "--json"',
		'    (testpath/"native").mkpath',
		'    system bin/"grainulator", "runtime", "init", "--dir", testpath/"native", "--json"',
		'    system bin/"grainulator", "runtime", "check", "--dir", testpath/"native", "--json", "--no-state"',
		"  end",
		"end",
		"",
	);
	return lines.join("\n");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const args = process.argv.slice(2),
			options = {};
		const map = {
			"--manifest": "manifest",
			"--manifest-sha256": "manifestSha256",
			"--artifacts": "artifactDirectory",
			"--out": "out",
		};
		for (let i = 0; i < args.length; i++) {
			const key = map[args[i]],
				value = args[++i];
			if (!key || !value || value.startsWith("--") || options[key])
				throw Error("Unknown, missing or duplicate formula option");
			options[key] = value;
		}
		const formula = renderFormula(options);
		fs.writeFileSync(path.resolve(options.out), formula, { flag: "wx" });
		console.log(
			"Formula prepared from pinned candidates. No installation or publication; verify recipe and public assets before promotion.",
		);
	} catch (e) {
		console.error("Homebrew formula: " + e.message);
		process.exitCode = 1;
	}
}
