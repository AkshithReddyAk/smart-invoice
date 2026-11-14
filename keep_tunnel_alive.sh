#!/usr/bin/env bash
export PATH="$HOME/.local/tools/node/bin:$PATH"

SUBDOMAIN="sri-laxmi-narayana-enterprises-invoice-portel"
PORT=8010

echo "🚀 Starting Resilient LocalTunnel Watchdog for: $SUBDOMAIN"

while true; do
  echo "[$(date)] Launching localtunnel for https://${SUBDOMAIN}.loca.lt..."
  
  # Run localtunnel and monitor output
  npx --yes localtunnel --port "$PORT" --subdomain "$SUBDOMAIN" 2>&1 | while IFS= read -r line; do
    echo "$line"
    # If localtunnel gave us a random domain instead of our requested subdomain, kill it to retry
    if [[ "$line" == *"your url is:"* ]]; then
      if [[ "$line" != *"$SUBDOMAIN"* ]]; then
        echo "⚠️ Assigned wrong subdomain ($line). Restarting to claim $SUBDOMAIN..."
        pkill -f "localtunnel.*$PORT" || true
      else
        echo "✅ Successfully claimed $SUBDOMAIN.loca.lt!"
      fi
    fi
  done

  echo "[$(date)] Connection closed or restarted. Re-acquiring $SUBDOMAIN in 2 seconds..."
  sleep 2
done
