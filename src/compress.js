"use strict";
/*
 * compress.js
 * A module that compresses an image.
 * compress(fastifyReq, fastifyReply, ReadableStream);
 */
const sharp = require('sharp');
const redirect = require('./redirect');

const sharpStream = () => sharp({ animated: !process.env.NO_ANIMATE, unlimited: true });

function compress(req, reply, input) {
  const format = req.params.webp ? 'webp' : 'jpeg';

  /*
   * Determine the uncompressed image size when there's no content-length header.
   */

  /*
   * input.pipe => sharp (The compressor) => Send to fastifyReply
   * The following headers:
   * |  Header Name  |            Description            |           Value            |
   * |---------------|-----------------------------------|----------------------------|
   * |x-original-size|Original photo size                |OriginSize                  |
   * |x-bytes-saved  |Saved bandwidth from original photo|OriginSize - Compressed Size|
   */
  input.body.pipe(
    sharpStream()
      .grayscale(req.params.grayscale)
      .toFormat(format, {
        quality: req.params.quality,
        progressive: true,
        optimizeScans: true,
      })
      .toBuffer((err, output, info) => {
        if (err || !info) return redirect(req, reply);

        reply
          .header('content-type', 'image/' + format)
          .header('content-length', info.size)
          .header('x-original-size', req.params.originSize)
          .header('x-bytes-saved', req.params.originSize - info.size)
          .status(200)
          .send(output);
      })
  );
}

module.exports = compress;
