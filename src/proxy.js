"use strict";
const { request } = require("undici");
const pick = require("lodash").pick;
const shouldCompress = require("./shouldCompress");
const redirect = require("./redirect");
const compress = require("./compress");
const copyHeaders = require("./copyHeaders");

async function proxy(request, reply) {
  if (
    request.headers["via"] == "1.1 bandwidth-hero" &&
    ["127.0.0.1", "::1"].includes(request.headers["x-forwarded-for"] || request.ip)
  )
    return redirect(request, reply);

  try {
    let origin = await request(request.params.url, {
      headers: {
        ...pick(request.headers, ["cookie", "dnt", "referer", "range"]),
        "user-agent": "Bandwidth-Hero Compressor",
        "x-forwarded-for": request.headers["x-forwarded-for"] || request.ip,
        via: "1.1 bandwidth-hero",
      },
      maxRedirections: 4,
    });
    _onRequestResponse(origin, request, reply);
  } catch (err) {
    _onRequestError(request, reply, err);
  }
}

function _onRequestError(request, reply, err) {
  if (err.code === "ERR_INVALID_URL") return reply.status(400).send("Invalid URL");

  redirect(request, reply);
  console.error(err);
}

function _onRequestResponse(origin, request, reply) {
  if (origin.statusCode >= 400) return redirect(request, reply);

  if (origin.statusCode >= 300 && origin.headers.location) return redirect(request, reply);

  copyHeaders(origin, reply);
  reply
    .header("content-encoding", "identity")
    .header("Access-Control-Allow-Origin", "*")
    .header("Cross-Origin-Resource-Policy", "cross-origin")
    .header("Cross-Origin-Embedder-Policy", "unsafe-none");
  
  request.params.originType = origin.headers["content-type"] || "";
  request.params.originSize = origin.headers["content-length"] || "0";

  origin.body.on("error", () => request.raw.socket.destroy());

  if (shouldCompress(request)) {
    return compress(request, reply, origin);
  } else {
    reply.header("x-proxy-bypass", 1);

    for (const headerName of ["accept-ranges", "content-type", "content-length", "content-range"]) {
      if (headerName in origin.headers) reply.header(headerName, origin.headers[headerName]);
    }

    return origin.body.pipe(reply.raw);
  }
}

module.exports = proxy;
