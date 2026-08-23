import { checkChatReviver } from '../services/chatReviverService.js';

let started = false;

export default {
  name: 'ready',
  once: true,
  async execute(client) {
    if (started) return;
    started = true;

    const run = () => checkChatReviver(client).catch(() => {});
    run();
    setInterval(run, 60 * 1000);
  },
};
