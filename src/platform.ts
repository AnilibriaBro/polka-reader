import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Где открыто приложение: Android-приложение из APK или браузер (iPhone, компьютер)
// Where the app runs: the Android APK or a browser (iPhone, computer)

export const isNative = Capacitor.isNativePlatform();

const ua = navigator.userAgent;
// iPad представляется компьютером Mac, но у него сенсорный экран / iPad pretends to be a Mac but has a touch screen
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

// Открыто с иконки на экране «Домой», а не во вкладке Safari / Opened from the Home Screen icon, not a Safari tab
export const isStandalone =
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// Кнопка «Назад» на Android. Обработчики складываю стопкой: срабатывает последний открытый экран,
// а если стопка пуста — приложение закрывается.
// Android back button. Handlers form a stack: the latest screen handles it; empty stack exits the app.
const stack: (() => void)[] = [];
if (isNative) {
  CapApp.addListener('backButton', () => {
    const top = stack[stack.length - 1];
    if (top) top();
    else CapApp.exitApp();
  });
}

export function useBack(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = () => ref.current();
    stack.push(fn);
    return () => {
      stack.splice(stack.indexOf(fn), 1);
    };
  }, []);
}
