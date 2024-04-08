/// <reference lib="webworker" />
import encode, { init as initAvifEncode } from '@jsquash/avif/encode';

import { DoWorkUnit, runWorker } from 'observable-webworker';
import { Observable, from } from 'rxjs';
import { encode as b64encode } from 'base64-arraybuffer';

initAvifEncode(undefined, {
  // Customise the path to load the wasm file
  locateFile: (path: string, prefix: string) => `./assets/avif_enc.wasm`,
});

interface orderedString {
  s: string;
  index: number;
}

export class CompressorWorker implements DoWorkUnit<orderedString, orderedString> {
  public workUnit(input: orderedString): Observable<orderedString> {
    return from(this.convert(input));
  }
  isDataURL = (s: string) =>
    s.match(
      '^(["\'`]data:image/(?:j?pe?n?g|webp);base64,[a-zA-Z0-9+/]+={0,2}["\'`])$'
    ) && s[0] == s.slice(-1);
  async convert(st: orderedString): Promise<orderedString> {
   const { s, index } = st;
    if (this.isDataURL(s)) {
      const blob = await (await fetch(s.slice(1, -1))).blob();
      const image = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx!.drawImage(image, 0 ,0, image.width, image.height);
      const imageData = ctx!.getImageData(0, 0, image.width, image.height);

      const avifBuffer = await encode(imageData!);
      const base64 = b64encode(avifBuffer);
      return {s: `"data:image/avif;base64,${base64}"`, index: index}  ;
    } else {
      return {s: s, index: index};
    }
  }
}

runWorker(CompressorWorker);
