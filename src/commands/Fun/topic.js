import { SlashCommandBuilder } from 'discord.js';
import { infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const TOPICS = [
  'What game could you play for hours without getting bored?',
  'If you could instantly master one skill, what would it be?',
  'What is the best movie or series you have watched recently?',
  'What fictional world would you want to visit for one day?',
  'What food could you eat every week and never get tired of?',
  'If you could travel anywhere tomorrow, where would you go?',
  'What is a small thing that always makes your day better?',
  'Which game deserves a sequel?',
  'What is the most useful app or website you use?',
  'If you could invent one thing, what would it do?',
  'What is an underrated hobby that more people should try?',
  'Would you rather explore space or the deepest parts of the ocean?',
  'What is one game you think everyone should try at least once?',
  'If you had unlimited money for one day, what would you do?',
  'What is the funniest thing that has happened to you while gaming?',
  'Which fictional character would make the best Discord moderator?',
  'What new feature would you add to your favorite game?',
  'What is your favorite way to spend a completely free day?',
  'If you could relive one day from your life, which day would you pick?',
  'What is a popular opinion about games that you completely disagree with?'
];

export default {
  data: new SlashCommandBuilder()
    .setName('topic')
    .setDescription('Get a random conversation starter.'),
  category: 'Fun',

  async execute(interaction) {
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const embed = infoEmbed('💬 Conversation Topic', `**${topic}**`);
    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
  },
};
