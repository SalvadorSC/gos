import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["client/main.js"],
  bundle: true,
  format: "esm",
  outfile: "public/bundle.js",
  legalComments: "none",
  logLevel: "info",
});
