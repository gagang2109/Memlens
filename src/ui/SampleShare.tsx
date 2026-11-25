import { useRef, useState } from "react";
import { samples } from "../samples";

export type SampleKey = keyof typeof samples;

export function readSampleLink(hash: string): SampleKey | undefined {
  const match = /^#sample=([a-z-]+)$/.exec(hash);
  return match && Object.hasOwn(samples, match[1]) ? match[1] as SampleKey : undefined;
}

export function SampleShare({ sample }: { sample: SampleKey }) {
  const { origin, pathname } = window.location;
  const link = origin + pathname + "#sample=" + sample;
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Link copied.");
    } catch {
      input.current?.focus();
      input.current?.select();
      setStatus("Link selected. Use your copy shortcut.");
    }
  };
  return <details className="sample-share">
    <summary>Share sample</summary>
    <label>Sample link <input ref={input} readOnly value={link} onFocus={event => event.currentTarget.select()} /></label>
    <button type="button" onClick={() => { void copy(); }}>Copy link</button>
    <span className="sample-share-note">Only the built-in example is shared. <span aria-live="polite" aria-atomic="true">{status}</span></span>
  </details>;
}
