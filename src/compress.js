"use strict";

const sharp = require('sharp');
const redirect = require('./redirect');

const sharpStream = () => sharp({ animated: !process.env.NO_ANIMATE, unlimited: true });

async function compress(req, reply, input) {
  const format = req.params.webp ? 'webp' : 'jpeg';

  try {
    const output = await sharpStream()
      .grayscale(req.params.grayscale)
      .toFormat(format, {
        quality: req.params.quality,
        progressive: true,
        optimizeScans: true,
      })
      .toBuffer();

    const info = await sharp(output).metadata();

    _sendResponse(null, output, info, format, req, reply);
  } catch (err) {
    _sendResponse(err, null, null, format, req, reply);
  }
}

function _sendResponse(err, output, info, format, req, reply) {
  if (err || !info) return redirect(req, reply);

  reply
    .header('content-type', 'image/' + format)
    .header('content-length', info.size)
    .header('x-original-size', req.params.originSize)
    .header('x-bytes-saved', req.params.originSize - info.size)
    .status(200)
    .send(output);
}

module.exports = compress;
