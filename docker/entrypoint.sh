#!/bin/sh
set -eu

DB_WAIT_MAX_RETRIES="${DB_WAIT_MAX_RETRIES:-30}"
DB_WAIT_RETRY_MS="${DB_WAIT_RETRY_MS:-2000}"

if [ -n "${DB_HOST:-}" ] && [ -n "${DB_PORT:-}" ]; then
  echo "Waiting for MySQL at ${DB_HOST}:${DB_PORT} ..."
  attempt=1

  while [ "$attempt" -le "$DB_WAIT_MAX_RETRIES" ]; do
    if node -e "const net=require('net');const socket=net.connect({host:process.env.DB_HOST,port:Number(process.env.DB_PORT)});socket.setTimeout(1500);socket.on('connect',()=>{socket.end();process.exit(0);});socket.on('timeout',()=>{socket.destroy();process.exit(1);});socket.on('error',()=>process.exit(1));"; then
      echo "MySQL endpoint is reachable."
      break
    fi

    if [ "$attempt" -eq "$DB_WAIT_MAX_RETRIES" ]; then
      echo "MySQL endpoint not reachable after ${DB_WAIT_MAX_RETRIES} attempts. Exiting."
      exit 1
    fi

    echo "Attempt ${attempt}/${DB_WAIT_MAX_RETRIES} failed. Retrying in ${DB_WAIT_RETRY_MS}ms ..."
    sleep_seconds=$((DB_WAIT_RETRY_MS / 1000))
    [ "$sleep_seconds" -lt 1 ] && sleep_seconds=1
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done
fi

exec "$@"
