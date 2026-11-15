/**
 * Shared EN / IT UI language state and distinct view links (Intro, Plan on the map, Enter the station).
 * Syncs with `localStorage['marswalk-lang']` and `?lang=` across Landing, Planner, and Marswalk VR.
 */
import { useEffect, useState } from 'react';

export type UiLang = 'en' | 'it';

const STORAGE_KEY = 'marswalk-lang';
const listeners = new Set<(lang: UiLang) => void>();

function readInitialLang(): UiLang {
  if (typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'it' || q === 'en') return q;
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'it' || saved === 'en') return saved;
    } catch {
      /* private mode */
    }
  }
  return 'en';
}

let currentLang: UiLang = readInitialLang();

export function getUiLang(): UiLang {
  return currentLang;
}

export function setUiLang(next: UiLang): void {
  if (next === currentLang) return;
  currentLang = next;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
  }
  if (typeof location !== 'undefined' && typeof history !== 'undefined' && typeof history.replaceState === 'function') {
    try {
      const url = new URL(location.href);
      url.searchParams.set('lang', next);
      history.replaceState(history.state, '', url.toString());
    } catch {
      /* ignore in opaque origins */
    }
  }
  listeners.forEach((fn) => fn(next));
}

export function useUiLang(): [UiLang, (next: UiLang) => void] {
  const [lang, setLangState] = useState<UiLang>(currentLang);
  useEffect(() => {
    listeners.add(setLangState);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLang;
    }
    return () => {
      listeners.delete(setLangState);
    };
  }, []);
  return [lang, setUiLang];
}

export function introHref(lang: UiLang): string {
  return `?landing=1&lang=${lang}#intro`;
}

export function plannerHref(lang: UiLang): string {
  return `?plan=1&lang=${lang}#planner`;
}

export function stationHref(lang: UiLang): string {
  return `marswalk-vr/index.html?lang=${lang}`;
}

export function syncViewUrl(view: 'intro' | 'planner', lang: UiLang): void {
  if (typeof location === 'undefined' || typeof history === 'undefined' || typeof history.pushState !== 'function') {
    return;
  }
  try {
    const url = new URL(location.href);
    url.searchParams.delete('landing');
    url.searchParams.delete('plan');
    url.searchParams.set(view === 'planner' ? 'plan' : 'landing', '1');
    url.searchParams.set('lang', lang);
    url.hash = view === 'planner' ? '#planner' : '#intro';
    history.pushState({ view }, '', url.toString());
  } catch {
    /* ignore in tests */
  }
}
