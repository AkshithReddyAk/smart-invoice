const localtunnel = require("/Users/akshithreddy/.npm/_npx/75ac80b86e83d4a2/node_modules/localtunnel");

const SUBDOMAIN = "sri-laxmi-narayana-enterprises-invoice-portel";
const PORT = 8010;

async function start() {
  console.log(`🚀 Starting SmartInvoice Persistent Tunnel for: ${SUBDOMAIN}`);
  while (true) {
    let tunnel = null;
    try {
      console.log(`[${new Date().toLocaleTimeString()}] Requesting subdomain: ${SUBDOMAIN}...`);
      tunnel = await localtunnel({
        port: PORT,
        subdomain: SUBDOMAIN,
      });

      if (!tunnel.url.includes(SUBDOMAIN)) {
        console.warn(`[${new Date().toLocaleTimeString()}] ⚠️ Server busy or assigned random: ${tunnel.url}`);
        console.warn(`[${new Date().toLocaleTimeString()}] Retrying in 7s to get exact subdomain...`);
        tunnel.close();
        await new Promise((r) => setTimeout(r, 7000));
        continue;
      }

      console.log(`[${new Date().toLocaleTimeString()}] ✅ ACTIVE & SECURED: ${tunnel.url}`);

      await new Promise((resolve) => {
        tunnel.on("close", () => {
          console.log(`[${new Date().toLocaleTimeString()}] Tunnel closed by remote server.`);
          resolve();
        });
        tunnel.on("error", (err) => {
          console.error(`[${new Date().toLocaleTimeString()}] Tunnel socket error:`, err.message);
          try { tunnel.close(); } catch (_) {}
          resolve();
        });
      });
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Connection attempt error:`, err.message);
      if (tunnel) {
        try { tunnel.close(); } catch (_) {}
      }
    }

    console.log(`[${new Date().toLocaleTimeString()}] Re-establishing tunnel in 5 seconds...`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

start();
