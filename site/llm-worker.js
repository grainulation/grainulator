import {
	MLCEngine,
	WebWorkerMLCEngineHandler,
} from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.82/+esm";

const engine = new MLCEngine();
const handler = new WebWorkerMLCEngineHandler(engine);
self.onmessage = (e) => {
	handler.onmessage(e);
};
