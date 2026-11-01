/**
 * Browser APIs that three's exporters use and Node does not provide. Test-environment only: the product
 * code runs in a browser where these exist natively.
 */
if (typeof globalThis.FileReader === 'undefined') {
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onload: ((this: NodeFileReader, ev: unknown) => void) | null = null;
    // three's GLTFExporter listens on onloadend, not onload.
    onloadend: ((this: NodeFileReader, ev: unknown) => void) | null = null;
    onerror: ((this: NodeFileReader, ev: unknown) => void) | null = null;
    private done(ev: unknown) {
      this.onload?.call(this, ev);
      this.onloadend?.call(this, ev);
    }
    readAsArrayBuffer(blob: Blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer;
          this.done({ target: this });
        })
        .catch((error) => this.onerror?.call(this, error));
    }
    readAsDataURL(blob: Blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = `data:${blob.type};base64,${btoa(String.fromCharCode(...new Uint8Array(buffer)))}`;
          this.done({ target: this });
        })
        .catch((error) => this.onerror?.call(this, error));
    }
  }
  globalThis.FileReader = NodeFileReader as unknown as typeof FileReader;
}
