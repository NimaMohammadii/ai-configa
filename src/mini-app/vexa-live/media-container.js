import { Container, getContainer } from "@cloudflare/containers";

export class VexaMediaContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
}

export function getVexaMediaContainer(env, userId) {
  if (!env.VEXA_MEDIA_CONTAINER) {
    throw new Error("Vexa media container is unavailable");
  }
  return getContainer(env.VEXA_MEDIA_CONTAINER, "vexa-live-user-" + String(userId));
}
