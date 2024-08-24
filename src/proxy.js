"use strict";

const undici = require("undici");
const pick = require("lodash/pick");
const shouldCompress = require("./shouldCompress");
const redirect = require("./redirect");
const compress = require("./compress");
const copyHeaders = require("./copyHeaders");
const { generateRandomIP, randomUserAgent } = require('./utils');

function randomVia() {
  return `1.1 bandwidth-hero-${Math.floor(Math.random() * 1000)}`;
}

async function proxy(req, reply) {
  const { url, jpeg, bw, l } = req.query;

  if (!url) {
    const ipAddress = generateRandomIP();
    const ua = randomUserAgent();
    const hdrs = {
      ...pick(req.headers, ['cookie', 'dnt', 'referer']),
      'x-forwarded-for': ipAddress,
      'user-agent': ua,
      'via': randomVia(),
    };

    Object.entries(hdrs).forEach(([key, value]) => reply.header(key, value));

    return reply.send('1we23');  // Added return here
  }

  const urlList = Array.isArray(url) ? url.join('&url=') : url;
  const cleanUrl = urlList.replace(/http:\/\/1\.1\.\d\.\d\/bmi\/(https?:\/\/)?/i, 'http://');

  req.params.url = cleanUrl;
  req.params.webp = !jpeg;
  req.params.grayscale = bw !== '0';
  req.params.quality = parseInt(l, 10) || 40;

  if (
    req.headers["via"] === "1.1 bandwidth-hero" &&
    ["127.0.0.1", "::1"].includes(req.headers["x-forwarded-for"] || req.ip)
  ) {
    return redirect(req, reply);  // Added return here
  }

  try {
    let origin = await undici.request(req.params.url, {
      headers: {
        ...pick(req.headers, ["cookie", "dnt", "referer", "range"]),
        "user-agent": "Bandwidth-Hero Compressor",
        "x-forwarded-for": req.headers["x-forwarded-for"] || req.ip,
        via: "1.1 bandwidth-hero",
      },
      maxRedirections: 4
    });

    return _onRequestResponse(origin, req, reply);  // Added return here
  } catch (err) {
    return _onRequestError(req, reply, err);  // Added return here
  }
}

function _onRequestError(req, reply, err) {
  if (err.code === "ERR_INVALID_URL") return reply.status(400).send("Invalid URL");

  redirect(req, reply);
  console.error(err);
}

function _onRequestResponse(origin, req, reply) {
  if (origin.statusCode >= 400) return redirect(req, reply);

  if (origin.statusCode >= 300 && origin.headers.location) return redirect(req, reply);

  copyHeaders(origin, reply);
  reply
    .header("content-encoding", "identity")
    .header("Access-Control-Allow-Origin", "*")
    .header("Cross-Origin-Resource-Policy", "cross-origin")
    .header("Cross-Origin-Embedder-Policy", "unsafe-none");

  req.params.originType = origin.headers["content-type"] || "";
  req.params.originSize = origin.headers["content-length"] || "0";

  origin.body.on('error', () => req.socket.destroy());

  if (shouldCompress(req)) {
    return compress(req, reply, origin);  // Added return here
  } else {
    reply.header("x-proxy-bypass", 1);

    for (const headerName of ["accept-ranges", "content-type", "content-length", "content-range"]) {
      if (headerName in origin.headers)
        reply.header(headerName, origin.headers[headerName]);
    }

    return origin.body.pipe(reply.raw);  // Added return here
  }
}

module.exports = proxy;
