import { precacheAndRoute } from 'workbox-precaching';

declare const self: { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

precacheAndRoute(self.__WB_MANIFEST);
