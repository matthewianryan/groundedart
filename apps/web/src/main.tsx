import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import { App } from "./App";
import "./styles.css";
import "@solana/wallet-adapter-react-ui/styles.css";

const network = WalletAdapterNetwork.Devnet;
const endpoint = import.meta.env.VITE_SOLANA_RPC_URL ?? clusterApiUrl(network);
const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })];

const storedTheme = (() => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("groundedart.theme");
  } catch {
    return null;
  }
})();
const resolvedTheme =
  storedTheme === "light" || storedTheme === "dark"
    ? storedTheme
    : typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
if (typeof document !== "undefined") {
  document.documentElement.dataset.theme = resolvedTheme;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
);
