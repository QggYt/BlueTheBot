import { createAllCommandsMenu, createCategoryCommandsMenu } from '../../../handlers/help/helpSelectMenus.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';

const ALL_PREFIX = 'help-page_';
const CATEGORY_PREFIX = 'help-category-page_';

function pageFromEmbed(interaction) {
    const footer = interaction.message?.embeds?.[0]?.footer?.text || '';
    const match = footer.match(/Page (\d+)\/(\d+)/);
    return { current: Number(match?.[1]) || 1, total: Number(match?.[2]) || 1 };
}

function getAction(customId, prefix) {
    return customId.slice(prefix.length);
}

function nextPage(current, total, action) {
    if (action === 'first') return 1;
    if (action === 'prev') return Math.max(1, current - 1);
    if (action === 'next') return Math.min(total, current + 1);
    if (action === 'last') return total;
    return current;
}

async function updateAll(interaction, client) {
    const { current, total } = pageFromEmbed(interaction);
    const page = nextPage(current, total, getAction(interaction.customId, ALL_PREFIX));
    const result = await createAllCommandsMenu(page, client);
    await interaction.editReply({ embeds: result.embeds, components: result.components });
}

async function updateCategory(interaction, client) {
    const { current, total } = pageFromEmbed(interaction);
    const title = interaction.message?.embeds?.[0]?.title || '';
    const category = title.replace(/^[^ ]+\s*/, '').replace(/\s+Commands$/, '').trim();
    const page = nextPage(current, total, getAction(interaction.customId, CATEGORY_PREFIX));
    const result = await createCategoryCommandsMenu(category, page, client);
    await interaction.editReply({ embeds: result.embeds, components: result.components });
}

const makeHandler = (name, action) => ({
    name,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
            await action(interaction, client);
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) return;
            await handleInteractionError(interaction, error, { type: 'button', customId: interaction.customId, handler: 'help_pagination' });
        }
    },
});

export default [
    makeHandler('help-page_first', updateAll),
    makeHandler('help-page_prev', updateAll),
    makeHandler('help-page_next', updateAll),
    makeHandler('help-page_last', updateAll),
    makeHandler('help-category-page_first', updateCategory),
    makeHandler('help-category-page_prev', updateCategory),
    makeHandler('help-category-page_next', updateCategory),
    makeHandler('help-category-page_last', updateCategory),
];
