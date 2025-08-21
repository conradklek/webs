import { resolve } from "path";

const CWD = process.cwd();

export const config = {
  CWD,
  PORT: process.env.PORT || 3000,
  IS_PROD: process.env.NODE_ENV === "production",
  OUTDIR: resolve(CWD, "dist"),
  TMPDIR: resolve(CWD, ".tmp"),
  TMP_CSS: resolve(CWD, ".tmp/tmp.css"),
  TMP_APP_JS: resolve(CWD, ".tmp/app.js"),
  SRC_DIR: resolve(CWD, "src"),
  APP_DIR: resolve(CWD, "src/app"),
  GLOBAL_CSS_PATH: resolve(CWD, "src/app.css"),
};
