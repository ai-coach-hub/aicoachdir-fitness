import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/ChatAttachmentPicker.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function runSelection(name, mime, { failBitmap = false } = {}) {
  const attached = [], pending = [], errors = [], drawn = [], cleaned = [];
  const blob = new Blob(["safe-jpeg-data"], { type: "image/jpeg" });
  let index = 0;
  const state = [];
  const react = {
    useRef: (initial) => ({ current: initial }),
    useEffect() {},
    useState: (initial) => {
      const i = index++;
      state[i] = initial;
      return [initial, (value) => {
        state[i] = typeof value === "function" ? value(state[i]) : value;
        if (i === 1 && typeof state[i] === "string" && state[i]) errors.push(state[i]);
      }];
    },
  };
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  class NativeImage {
    naturalWidth = 2200;
    naturalHeight = 1700;
    async decode() {}
    set src(value) { this.srcValue = value; }
  }
  const URLObject = {
    createObjectURL: () => "blob:test-" + cleaned.length,
    revokeObjectURL: (value) => { cleaned.push(value); },
  };
  const context = {
    fillStyle: "",
    fillRect() {},
    drawImage(image) { drawn.push(image); },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback, type) => { assert.equal(type, "image/jpeg"); callback(blob); },
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    Blob, Image: NativeImage, URL: URLObject,
    document: { createElement: (tag) => {
      assert.equal(tag, "canvas");
      return canvas;
    } },
    createImageBitmap: async () => {
      if (failBitmap) throw new Error("Safari File bitmap decoder unavailable");
      return { width: 2200, height: 1700, close() {} };
    },
    require(id) {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (id === "./ChatAttachmentPicker.module.css") return { __esModule: true, default: {
        wrap: "wrap", chip: "chip", note: "note", error: "error",
        addButton: "addButton", visuallyHidden: "visuallyHidden", thumbnail: "thumbnail",
        fileName: "fileName", size: "size", remove: "remove" } };
      throw new Error("Unexpected import " + id);
    },
  });
  const picker = module.exports.default({
    photoSendingEnabled: true,
    onPendingChange: (value) => pending.push(value),
    onPhotoAttachment: (value) => { if (value) attached.push(value); },
  });
  function visit(node) {
    if (Array.isArray(node)) { for (const element of node) { const r = visit(element); if (r) return r; } return null; }
    if (!node || typeof node !== "object") return null;
    if (node.type === "input") return node;
    return visit(node.props?.children);
  }
  const input = visit(picker);
  assert.ok(input, "picker input must exist");
  input.props.onChange({ currentTarget: {
    files: [{name, type:mime, size:5 * 1024 * 1024}],
  } });
  return { attached, pending, errors, drawn, cleaned };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const [name,mime] of [
  ["IMG_0299.HEIC","image/heic"],
  ["IMG_0299.heif","image/heif"],
  ["IMG_0299.HEIC",""],
  ["IMG_0299.jpeg","image/jpeg"],
]) {
  test("iPhone attachment converts " + name + " with MIME " + (mime || "(empty)") + " into a bounded JPEG", async () => {
    const result = runSelection(name,mime);
    await tick();
    assert.equal(result.errors.length,0);
    assert.equal(result.attached.length,1);
    assert.equal(result.attached[0].jpeg.type,"image/jpeg");
    assert.equal(result.pending.at(-1),false);
    assert.equal(result.drawn.length,1);
  });
}
test("Safari HEIC bitmap failure uses native image-element decoder",async()=>{
  const result=runSelection("IMG_0299.HEIC","image/heic",{failBitmap:true});
  await tick();
  assert.equal(result.errors.length,0);
  assert.equal(result.attached.length,1);
  assert.equal(result.pending.at(-1),false);
  assert.ok(result.cleaned.length >= 1,"temporary input blob URL must be revoked");
});
test("upload picker does not present old bulky file-format message",()=>{
  assert.doesNotMatch(source,/Choose a JPG, PNG, WebP, PDF, Word, Excel/);
  assert.doesNotMatch(source,/Pressing Send shares this attachment/);
  assert.match(source,/const MAX_SOURCE_PHOTO_BYTES = 30 \* 1024 \* 1024/);
  assert.match(source,/if \(picker.current\) picker.current.value = ""/);
});
