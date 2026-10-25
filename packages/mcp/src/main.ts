#!/usr/bin/env node
import { runMcpStdio } from "./server.ts"

void runMcpStdio().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
