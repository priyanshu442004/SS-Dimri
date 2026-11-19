// PM2 file for the AI products' backends (ports 8100–8109, localhost only; nginx proxies
// /ai-products/<slug>/api/* to them after checking the ERP session — see nginx-ai-products.conf).
//   pm2 startOrReload ai-products/deploy/ecosystem.config.cjs --update-env && pm2 save
// Each backend reads its own secrets from <backend>/.env (copied to the server by hand).
const path = require("path");
const apps = path.resolve(__dirname, "../apps");

const node = (slug, port, mem) => ({
  name: `aip-${slug}`,
  cwd: path.join(apps, slug, "backend"),
  script: "server.js",
  env: { NODE_ENV: "production", HOST: "127.0.0.1", PORT: port, PYTHON_BIN: "report/.venv/bin/python" },
  max_memory_restart: mem,
  time: true,
});

module.exports = {
  apps: [
    node("financial-reporting", 8100, "400M"),
    node("virtual-cfo", 8101, "350M"),
    node("bank-reconciliation", 8102, "300M"),
    node("invoice-automation", 8103, "350M"),
    node("tds-return", 8105, "300M"),
    node("vendor-ledger", 8106, "300M"),
    node("customer-ledger", 8107, "300M"),
    // Payroll & Compliance is switched off, as on aiproducts.analytx4t.com — uncomment to bring it back.
    // node("payroll-compliance", 8108, "300M"),
    node("fixed-asset-register", 8109, "300M"),
    {
      // FastAPI (Python) from its own virtualenv
      name: "aip-gst-reconciliation",
      cwd: path.join(apps, "gst-reconciliation/backend"), // reads ./.env, writes ./data
      script: ".venv/bin/python",
      args: "-m uvicorn app.main:app --host 127.0.0.1 --port 8104 --workers 1",
      interpreter: "none",
      env: { PYTHONUNBUFFERED: "1" },
      max_memory_restart: "500M",
      time: true,
    },
  ],
};
