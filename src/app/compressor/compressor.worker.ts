/// <reference lib="webworker" />
import encode, { init as initAvifEncode } from '@jsquash/avif/encode';

import { ImageMagick, MagickFormat, initializeImageMagick } from '../../../node_modules/@imagemagick/magick-wasm';

import { DoWorkUnit, runWorker } from 'observable-webworker';
import { Observable, from } from 'rxjs';
import { encode as b64encode } from 'base64-arraybuffer';

import { OrderedString } from '../models/ordered-string';

initAvifEncode(undefined, {
  // Customise the path to load the wasm file
  locateFile: (path: string, prefix: string) => './assets/wasm/avif_enc.wasm'
});

export class CompressorWorker implements DoWorkUnit<OrderedString, OrderedString> {
  public workUnit(input: OrderedString): Observable<OrderedString> {
    return from(this.convert(input));
  }
  MIME = RegExp('image/([a-z]+)');
  isDataURL = (s: string) =>
    s.match(
      '^(["\'`]data:image/(?:j?pe?n?g|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}["\'`])$'
    ) && s[0] == s.slice(-1);
  async convert(st: OrderedString): Promise<OrderedString> {
   const { s, index, quality } = st;
    // if this string is an image
    if (this.isDataURL(s) && (!this.isWebp(s) || !this.isAnimatedWebp(s))) {
      // fetch it as a blob
      const blob = await (await fetch(s.slice(1, -1))).blob();

      // detect animated gifs; convert to animated webp
      // todo: update to use animated avif when
      // https://github.com/ImageMagick/ImageMagick/issues/6380
      // is fixed
      if ((this.isGif(s) && await this.isGifAnimated(s)) ) {
        const byteArray = new Uint8Array(await blob.arrayBuffer());
        // there probably aren't a lot of animated gifs
        // so lets only initialize imagemagik if needed
        await initializeImageMagick(new URL(`${location.origin}/assets/wasm/magick.wasm`, import.meta.url))
        // use readCollection to read in all frames of the gif
        const imageBytes = ImageMagick.readCollection(byteArray,  (image) => {
          const result = image.write(MagickFormat.Webp, data => {
            // we have to copy the image to a new object because
            // the memory will be freed by the
            // web assembly code when it leaves this
            // scope
            const data2 = this.copyUint8Array(data)
            return data2
          }
          )
          return result;
        })
        const base64 = this.Uint8ToBase64(imageBytes);
        let rs: string =  `"data:image/webp;base64,${base64}"`
        if (rs.length > s.length){
          rs = s;
        }
        return {s: rs, index: index, quality}
      } 

      // convert to imageData for avif encoder
      const image = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx!.drawImage(image, 0 ,0, image.width, image.height);
      const imageData = ctx!.getImageData(0, 0, image.width, image.height);

      const avifBuffer = await encode(imageData!, {cqLevel: quality});
      const base64 = b64encode(avifBuffer);
      let rs: string =  `"data:image/avif;base64,${base64}"`
      if (rs.length > s.length){
        rs = s;
      }
      return {s: rs, index: index, quality}
    } else {
      // if it isn't a image we return the string
      // as is
      return {s: s, index: index, quality};
    }
  }

  isWebp(s: string): boolean {
    return s.slice(12, 16) === 'webp'
  }
  // detect base64 encoded ANIM chunk
  // which controls animation
  // should not occur in a non animated image
  // some misbehaved applications might insert it anyways
  // https://developers.google.com/speed/webp/docs/riff_container
  isAnimatedWebp(s: string) {
    return s.slice(64, 70) === 'QU5JTQ';
  }

  isGif(s: string): boolean {
    return s.slice(12, 15) === "gif"
  }

  // somebody posted this in a github issue

  copyUint8Array(sourceArray: Uint8Array) {
    // Create a new Uint8Array with the same length as the source array
    const copiedArray = new Uint8Array(sourceArray.length);
    
        // Iterate through the source array and copy its elements to the new array
        for (let i = 0; i < sourceArray.length; i++) {
            copiedArray[i] = sourceArray[i];
        }
        // Return the new Uint8Array
        return copiedArray;
    }

  // code below is courtesy of stack overflow

  Uint8ToBase64(u8Arr: Uint8Array): string{
    var CHUNK_SIZE = 0x8000; //arbitrary number
    var index = 0;
    var length = u8Arr.length;
    var result = '';
    var slice;
    while (index < length) {
      slice = u8Arr.subarray(index, Math.min(index + CHUNK_SIZE, length)); 
      result += String.fromCharCode.apply(null, slice as unknown as number[]);
      index += CHUNK_SIZE;
    }
    return btoa(result);
  }

  HEADER_LEN: number = 6; // offset bytes for the header section
  LOGICAL_SCREEN_DESC_LEN: number = 7; // offset bytes for logical screen description section

  async isGifAnimated(s:string): Promise<Boolean> {
    const blob = await (await fetch(s.slice(1, -1))).blob();
    const buffer = await blob.arrayBuffer();
    // Start from last 4 bytes of the Logical Screen Descriptor
    const dv = new DataView(buffer, this.HEADER_LEN + this.LOGICAL_SCREEN_DESC_LEN - 3);
    const globalColorTable = dv.getUint8(0); // aka packet byte
    let globalColorTableSize = 0;
    let offset = 0;

    // check first bit, if 0, then we don't have a Global Color Table
    if (globalColorTable & 0x80) {
      // grab the last 3 bits, to calculate the global color table size -> RGB * 2^(N+1)
      // N is the value in the last 3 bits.
      globalColorTableSize = 3 * Math.pow(2, (globalColorTable & 0x7) + 1);
    }

    // move on to the Graphics Control Extension
    offset = 3 + globalColorTableSize;

    var extensionIntroducer = dv.getUint8(offset);
    var graphicsConrolLabel = dv.getUint8(offset + 1);
    var delayTime = 0;

    // Graphics Control Extension section is where GIF animation data is stored
    // First 2 bytes must be 0x21 and 0xF9
    if (extensionIntroducer & 0x21 && graphicsConrolLabel & 0xf9) {
      // skip to the 2 bytes with the delay time
      delayTime = dv.getUint16(offset + 4);
    }

    return Boolean(delayTime);
  }
}

runWorker(CompressorWorker);
