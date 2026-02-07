require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
const fs = require("fs");
const System = require("./System/System");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const inMemory = {
  rateLimit: new Map(),
  pending: new Map(),
  ticketOpenCount: new Map(),
};

const messages = {
  ar: {
    chooseLanguage: "اختر اللغة: اكتب AR أو EN",
    chooseCategory: "اختر نوع التذكرة من الأزرار:",
    askReason: "اكتب سبب فتح التذكرة باختصار.",
    alreadyOpen: "عندك تذكرة مفتوحة بالفعل. انتظر رد الدعم.",
    blocked: "تم حظرك مؤقتًا بسبب كثرة فتح التذاكر.",
    rateLimited: "يرجى التهدئة. تم تقييد الرسائل بسبب السبام.",
    ticketOpened: "تم فتح التذكرة بنجاح ✅",
    ticketClosed: "تم إغلاق التذكرة. شكراً لك.",
    waiting: "الدعم مشغول حاليًا، تم إضافتك إلى قائمة الانتظار.",
    rating: "قيّم الدعم من 1 إلى 5.",
    invalidChoice: "اختيار غير صالح. حاول مرة أخرى.",
    setupRequired: "البوت غير مهيأ في هذا السيرفر بعد. اطلب من الإدارة استخدام /setup.",
    setupExpired: "انتهى وقت إعداد التذكرة. أرسل رسالة جديدة للبدء من جديد.",
    idleClosed: "تم إغلاق التذكرة بسبب التأخير في الرد.",
    ticketPromptTitle: "🎫 إنشاء تذكرة دعم",
    ticketPromptBody:
      "```\nيرجى اختيار نوع التذكرة من الأزرار أدناه.\nسيتم إغلاق الطلب تلقائياً إذا لم تُكمل خلال الوقت المحدد.\n```",
    requestDetailsTitle: "تفاصيل التذكرة",
    requestDetailsBody:
      "**يرجى كتابة السبب بالتفصيل مع أي معلومات مهمة مثل:\n• رقم الطلب\n• الوقت\n• رابط/صورة\n• خطوات المشكلة**",
    chooseLanguageTitle: "اختر اللغة | Choose Language",
    chooseLanguageBody:
      "```\nاختر اللغة من الأزرار أدناه.\nSelect your language from the buttons below.\n```",
    claimNoticeSupport: "تم استلام التكت من قبل Chillaxy Support ✅",
    claimNoticeAdmin: "تم استلام التكت من قبل شلاكسي ادمن ✅",
    reopenPrompt: "تريد فتح تكت جديد؟ اضغط الزر أدناه.",
    ratingLowReason: "لو التقييم أقل من 3 نجوم، اكتب سبب عدم رضاك.",
  },
  en: {
    chooseLanguage: "Choose language: type AR or EN",
    chooseCategory: "Choose a ticket category using the buttons:",
    askReason: "Describe the reason for opening the ticket.",
    alreadyOpen: "You already have an open ticket. Please wait for support.",
    blocked: "You are temporarily blocked due to too many tickets.",
    rateLimited: "Please slow down. You are being rate limited.",
    ticketOpened: "Ticket opened successfully ✅",
    ticketClosed: "Ticket closed. Thank you.",
    waiting: "Support is busy. You have been added to the waiting list.",
    rating: "Rate support from 1 to 5.",
    invalidChoice: "Invalid choice. Try again.",
    setupRequired: "The bot is not configured in this server yet. Ask staff to run /setup.",
    setupExpired: "Ticket setup timed out. Send a new message to start again.",
    idleClosed: "Ticket closed due to inactivity.",
    ticketPromptTitle: "🎫 Create Support Ticket",
    ticketPromptBody:
      "```\nPlease choose a category using the buttons below.\nThe request will timeout if you don't complete it in time.\n```",
    requestDetailsTitle: "Ticket Details",
    requestDetailsBody:
      "**Please describe the issue with details such as:\n• Order ID\n• Time\n• Link/Screenshot\n• Reproduction steps**",
    chooseLanguageTitle: "اختر اللغة | Choose Language",
    chooseLanguageBody:
      "```\nاختر اللغة من الأزرار أدناه.\nSelect your language from the buttons below.\n```",
    claimNoticeSupport: "Your ticket has been claimed by Chillaxy Support ✅",
    claimNoticeAdmin: "Your ticket has been claimed by Chillaxy Admin ✅",
    reopenPrompt: "Want to open a new ticket? Tap the button below.",
    ratingLowReason: "If rating is below 3, please share your feedback.",
  },
};

const closeRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("ticket_close")
    .setLabel("Close")
    .setStyle(ButtonStyle.Danger)
);

const dmCloseRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("ticket_close_user")
    .setLabel("Close Ticket")
    .setStyle(ButtonStyle.Danger),
  new ButtonBuilder()
    .setCustomId("ticket_reopen")
    .setLabel("Reopen Ticket")
    .setStyle(ButtonStyle.Secondary)
);

const ratingRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("ticket_rate:1").setLabel("1").setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId("ticket_rate:2").setLabel("2").setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId("ticket_rate:3").setLabel("3").setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId("ticket_rate:4").setLabel("4").setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId("ticket_rate:5").setLabel("5").setStyle(ButtonStyle.Success)
);

function loadData() {
  if (!fs.existsSync(System.dataFile)) {
    return { tickets: {}, guilds: {}, primaryGuildId: "", nextTicketNumber: 1 };
  }
  try {
    const raw = fs.readFileSync(System.dataFile, "utf-8");
    return raw
      ? JSON.parse(raw)
      : { tickets: {}, guilds: {}, primaryGuildId: "", nextTicketNumber: 1 };
  } catch (error) {
    return { tickets: {}, guilds: {}, primaryGuildId: "", nextTicketNumber: 1 };
  }
}

function saveData(data) {
  fs.writeFileSync(System.dataFile, JSON.stringify(data, null, 2));
}

function getGuildConfig(guildId) {
  const data = loadData();
  const stored = data.guilds?.[guildId]?.config || {};
  return { ...System.defaults, ...(System.guilds[guildId] || {}), ...stored };
}

function ensureGuild(data, guildId) {
  if (!data.tickets[guildId]) {
    data.tickets[guildId] = {};
  }
  if (!data.guilds) data.guilds = {};
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = { removedAt: null };
  }
}

function getLocale(lang) {
  return messages[lang] ? lang : "ar";
}

function isManager(member, config) {
  if (!member) return false;
  if (config.adminRoleId) {
    return member.roles.cache.has(config.adminRoleId);
  }
  return member.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

function isSupport(member, config) {
  if (!member) return false;
  if (!config.supportRoleIds.length) return member.permissions.has("ManageGuild");
  return config.supportRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

function appendRateLimit(userId) {
  const now = Date.now();
  const entries = inMemory.rateLimit.get(userId) || [];
  const updated = entries.filter((time) => now - time < 60_000);
  updated.push(now);
  inMemory.rateLimit.set(userId, updated);
  return updated.length;
}

function appendTicketOpen(userId) {
  const now = Date.now();
  const entries = inMemory.ticketOpenCount.get(userId) || [];
  const updated = entries.filter((time) => now - time < 86_400_000);
  updated.push(now);
  inMemory.ticketOpenCount.set(userId, updated);
  return updated.length;
}

function createTicketId() {
  return `T-${Date.now().toString(36).toUpperCase()}`;
}

function getPrimaryGuildId() {
  const data = loadData();
  if (data.primaryGuildId) return data.primaryGuildId;
  if (System.defaults.primaryGuildId) return System.defaults.primaryGuildId;
  return client.guilds.cache.first()?.id || null;
}

function buildCategoryButtons(config) {
  const row = new ActionRowBuilder();
  for (const category of config.ticketCategories.slice(0, 5)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_category:${category.id}`)
        .setLabel(category.labelAr)
        .setStyle(ButtonStyle.Primary)
    );
  }
  return [row];
}

function buildLanguageButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_lang:ar").setLabel("عربي").setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("ticket_lang:en")
        .setLabel("English")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

async function ensureThread(channel, name) {
  return channel.threads.create({
    name,
    autoArchiveDuration: 1440,
  });
}

function buildTicketEmbed(ticket, user, config, locale) {
  const categories = config.ticketCategories.find(
    (category) => category.id === ticket.category
  );
  return new EmbedBuilder()
    .setTitle(`🎫 Ticket ${ticket.id}`)
    .setDescription(
      "```\nتفاصيل التذكرة الرسمية\nOfficial Ticket Details\n```"
    )
    .setColor(config.embedColor || "#5865F2")
    .setImage("https://i.ibb.co/9H5x1B5K/0xy.gif")
    .addFields(
      {
        name: "👤 User",
        value: `${user.tag}\n\`${user.id}\``,
      },
      {
        name: locale === "ar" ? "🏷️ النوع" : "🏷️ Category",
        value:
          locale === "ar"
            ? categories?.labelAr || ticket.category
            : categories?.labelEn || ticket.category,
      },
      {
        name: locale === "ar" ? "📌 الحالة" : "📌 Status",
        value: ticket.status.toUpperCase(),
      },
      {
        name: locale === "ar" ? "📝 السبب" : "📝 Reason",
        value: ticket.reason,
      },
      {
        name: locale === "ar" ? "🆔 رقم التكت" : "🆔 Ticket Number",
        value: `#${ticket.number}`,
      },
      {
        name: locale === "ar" ? "⏰ وقت الفتح" : "⏰ Opened At",
        value: `<t:${Math.floor(ticket.openedAt / 1000)}:F>`,
      },
      {
        name: locale === "ar" ? "🔒 الصلاحية" : "🔒 Access",
        value: config.supportRoleIds.length
          ? config.supportRoleIds.map((id) => `<@&${id}>`).join(" ")
          : locale === "ar"
            ? "إدارة السيرفر"
            : "Server management",
      }
    )
    .setTimestamp(ticket.openedAt);
}

async function closeTicket({ guildId, ticket, config, reason }) {
  const data = loadData();
  ensureGuild(data, guildId);
  const ticketData = data.tickets[guildId][ticket.userId];
  if (!ticketData) return;
  ticketData.status = "closed";
  ticketData.closedAt = Date.now();
  ticketData.closeReason = reason;
  saveData(data);

  if (ticket.threadId) {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(config.supportChannelId);
    const thread = await channel.threads.fetch(ticket.threadId).catch(() => null);
    if (thread) {
      await thread.setLocked(true).catch(() => null);
      await thread.setArchived(true).catch(() => null);
    }
  }

  const user = await client.users.fetch(ticket.userId).catch(() => null);
  if (user) {
    const locale = getLocale(ticket.language || config.language);
    if (reason === "idle timeout") {
      await user.send(messages[locale].idleClosed).catch(() => null);
    } else {
      await user.send(messages[locale].ticketClosed).catch(() => null);
    }
    const duration = ticketData.closedAt
      ? Math.max(1, Math.round((ticketData.closedAt - ticketData.openedAt) / 60000))
      : 1;
    await user
      .send(
        `**رقم التكت:** #${ticket.number}\n**تم حل مشكلتك خلال:** ${duration} دقيقة`
      )
      .catch(() => null);
    await user
      .send({ content: messages[locale].rating, components: [ratingRow] })
      .catch(() => null);
    await user
      .send({ content: messages[locale].reopenPrompt, components: [dmCloseRow] })
      .catch(() => null);
    inMemory.pending.set(user.id, {
      step: "rating",
      guildId,
      ticketId: ticket.id,
      language: locale,
    });
  }

  if (config.logsChannelId) {
    const guild = await client.guilds.fetch(guildId);
    const logsChannel = await guild.channels
      .fetch(config.logsChannelId)
      .catch(() => null);
    if (logsChannel) {
      const htmlBody = ticket.messages
        .map(
          (entry) =>
            `<p><strong>${entry.from}</strong> [${new Date(entry.timestamp).toISOString()}] : ${entry.content}</p>`
        )
        .join("\n");
      const html = `<!doctype html><html><head><meta charset=\"utf-8\"><title>Ticket ${ticket.id}</title></head><body>${htmlBody}</body></html>`;
      const file = new AttachmentBuilder(Buffer.from(html), {
        name: `ticket-${ticket.id}.html`,
      });
      const color =
        reason === "idle timeout"
          ? 0xffa500
          : reason === "user close"
            ? 0xff5555
            : 0x2ecc71;
      const logEmbed = new EmbedBuilder()
        .setTitle(`Ticket Closed ${ticket.id}`)
        .setColor(color)
        .addFields(
          { name: "User", value: `${ticket.userTag} (${ticket.userId})` },
          { name: "Reason", value: reason || "-" }
        )
        .setTimestamp();
      await logsChannel.send({ embeds: [logEmbed], files: [file] }).catch(() => null);
    }
  }
}

function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Configure the DM ticket bot")
      .addChannelOption((option) =>
        option
          .setName("support_channel")
          .setDescription("Channel for support threads")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName("logs_channel")
          .setDescription("Channel for ticket logs")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addRoleOption((option) =>
        option
          .setName("support_role")
          .setDescription("Role allowed to reply/close tickets")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("language")
          .setDescription("Default language")
          .addChoices(
            { name: "Arabic", value: "ar" },
            { name: "English", value: "en" }
          )
          .setRequired(true)
      )
      .addRoleOption((option) =>
        option
          .setName("mention_role")
          .setDescription("Role to mention on new tickets")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("embed_color")
          .setDescription("Embed color hex (e.g. #5865F2)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("purge-user")
      .setDescription("Delete a user's ticket data")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to delete data for")
          .setRequired(true)
      ),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(System.token);
  return rest.put(Routes.applicationCommands(client.user.id), { body: commands });
}

async function cleanupRemovedGuilds() {
  const data = loadData();
  const now = Date.now();
  const cutoff = System.defaults.removeDataAfterDays * 86_400_000;
  for (const [guildId, meta] of Object.entries(data.guilds || {})) {
    if (meta?.removedAt && now - meta.removedAt > cutoff) {
      delete data.tickets[guildId];
      delete data.guilds[guildId];
    }
  }
  saveData(data);
}

async function handlePendingFlow(message, data) {
  const pending = inMemory.pending.get(message.author.id);
  if (!pending) return false;
  const locale = getLocale(pending.language || "ar");
  if (pending.expiresAt && Date.now() > pending.expiresAt) {
    inMemory.pending.delete(message.author.id);
    await message.author.send(messages[locale].setupExpired).catch(() => null);
    return true;
  }

  if (pending.step === "rating") {
    const rating = Number(message.content.trim());
    if (!rating || rating < 1 || rating > 5) {
      await message.author.send(messages[locale].invalidChoice).catch(() => null);
      return true;
    }
    ensureGuild(data, pending.guildId);
    const ticket = Object.values(data.tickets[pending.guildId]).find(
      (entry) => entry.id === pending.ticketId
    );
    if (ticket) {
      ticket.rating = rating;
      saveData(data);
    }
    inMemory.pending.delete(message.author.id);
    return true;
  }

  if (pending.step === "language") {
    await message.author.send(messages[locale].invalidChoice).catch(() => null);
    return true;
  }

  if (pending.step === "category") {
    const config = getGuildConfig(pending.guildId);
    const index = Number(message.content.trim()) - 1;
    const category = config.ticketCategories[index];
    if (!category) {
      await message.author.send(messages[locale].invalidChoice).catch(() => null);
      return true;
    }
    pending.category = category.id;
    pending.step = "reason";
    await sendPendingPrompt(message.author, pending);
    return true;
  }

  if (pending.step === "reason") {
    pending.reason = message.content.trim();
    await createTicketFromPending(message.author, pending);
    inMemory.pending.delete(message.author.id);
    return true;
  }

  if (pending.step === "rating_reason") {
    const data = loadData();
    ensureGuild(data, pending.guildId);
    const ticket = Object.values(data.tickets[pending.guildId]).find(
      (entry) => entry.id === pending.ticketId
    );
    if (ticket) {
      ticket.feedback = message.content.trim();
      saveData(data);
    }
    inMemory.pending.delete(message.author.id);
    return true;
  }

  return true;
}

async function sendPendingPrompt(user, pending) {
  const locale = getLocale(pending.language || "ar");
  if (pending.step === "language") {
    const embed = new EmbedBuilder()
      .setTitle(messages[locale].chooseLanguageTitle)
      .setDescription(messages[locale].chooseLanguageBody)
      .setColor(0x2f3136);
    await user
      .send({
        embeds: [embed],
        components: buildLanguageButtons(),
      })
      .catch(() => null);
    return;
  }
  if (pending.step === "category") {
    const config = getGuildConfig(pending.guildId);
    const embed = new EmbedBuilder()
      .setTitle(messages[locale].ticketPromptTitle)
      .setDescription(messages[locale].ticketPromptBody)
      .setColor(0x2f3136);
    await user
      .send({
        embeds: [embed],
        components: buildCategoryButtons(config),
      })
      .catch(() => null);
    return;
  }
  if (pending.step === "reason") {
    const embed = new EmbedBuilder()
      .setTitle(messages[locale].requestDetailsTitle)
      .setDescription(messages[locale].requestDetailsBody)
      .setColor(0x5865f2);
    await user.send({ embeds: [embed] }).catch(() => null);
    await user.send(messages[locale].askReason).catch(() => null);
  }
}

async function createTicketFromPending(user, pending) {
  const data = loadData();
  ensureGuild(data, pending.guildId);
  const config = getGuildConfig(pending.guildId);
  const locale = getLocale(pending.language || config.language);

  const existing = data.tickets[pending.guildId][user.id];
  if (existing && existing.status === "open") {
    await user.send(messages[locale].alreadyOpen).catch(() => null);
    return;
  }

  if (!config.supportChannelId) {
    await user.send(messages[locale].setupRequired).catch(() => null);
    return;
  }

  const ticketId = createTicketId();
  const ticketNumber = data.nextTicketNumber || 1;
  data.nextTicketNumber = ticketNumber + 1;
  const ticket = {
    id: ticketId,
    number: ticketNumber,
    guildId: pending.guildId,
    userId: user.id,
    userTag: user.tag,
    openedAt: Date.now(),
    status: "open",
    language: locale,
    category: pending.category,
    reason: pending.reason,
    messages: [],
    lastActivity: Date.now(),
  };

  data.tickets[pending.guildId][user.id] = ticket;
  saveData(data);

  const guild = await client.guilds.fetch(pending.guildId);
  const channel = await guild.channels.fetch(config.supportChannelId);
  const thread = await ensureThread(channel, `ticket-${ticketId}`);
  ticket.threadId = thread.id;
  saveData(data);

  const embed = buildTicketEmbed(ticket, user, config, locale);
  const mention = config.mentionRoleId ? `<@&${config.mentionRoleId}>` : "";
  await thread.send({
    content: `${mention} <@${user.id}>`,
    embeds: [embed],
    components: [
      closeRow,
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket_claim")
          .setLabel("Claim")
          .setStyle(ButtonStyle.Success)
      ),
    ],
  });

  if (config.waitingThreshold) {
    const openTickets = Object.values(data.tickets[pending.guildId]).filter(
      (entry) => entry.status === "open"
    ).length;
    if (openTickets >= config.waitingThreshold) {
      await user.send(messages[locale].waiting).catch(() => null);
    }
  }

  await user.send(messages[locale].ticketOpened, { components: [dmCloseRow] }).catch(() => null);
}

async function forwardUserMessage(message, ticket, config) {
  const data = loadData();
  ensureGuild(data, ticket.guildId);
  const guild = await client.guilds.fetch(ticket.guildId);
  const channel = await guild.channels.fetch(config.supportChannelId);
  const thread = await channel.threads.fetch(ticket.threadId).catch(() => null);
  if (!thread) return;

  const embed = new EmbedBuilder()
    .setDescription(message.content)
    .setAuthor({ name: `${message.author.tag} (${message.author.id})` })
    .setTimestamp();

  await thread.send({ content: `<@${message.author.id}>`, embeds: [embed] });

  const stored = data.tickets[ticket.guildId][ticket.userId];
  if (stored) {
    stored.messages.push({
      from: "user",
      content: message.content,
      timestamp: Date.now(),
    });
    stored.lastActivity = Date.now();
    saveData(data);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (!message.guild && message.channel.type === ChannelType.DM) {
    const data = loadData();
    const rate = appendRateLimit(message.author.id);
    const pending = inMemory.pending.get(message.author.id);
    if (pending && (await handlePendingFlow(message, data))) {
      return;
    }

    if (rate > System.defaults.maxMessagesPerMinute) {
      await message.author.send(messages.ar.rateLimited).catch(() => null);
      return;
    }
    await message.react("🗳️").catch(() => null);

    const guildId = getPrimaryGuildId();
    if (!guildId) {
      await message.author.send(messages.ar.setupRequired).catch(() => null);
      return;
    }
    const ticket = data.tickets[guildId]?.[message.author.id];
    if (ticket?.status === "open") {
      const config = getGuildConfig(guildId);
      await forwardUserMessage(message, ticket, config);
      return;
    }

    const ticketCount = appendTicketOpen(message.author.id);
    if (ticketCount > System.defaults.maxTicketsPerDay) {
      await message.author.send(messages.ar.blocked).catch(() => null);
      return;
    }

    const newPending = {
      step: "language",
      language: "ar",
      userId: message.author.id,
      guildId,
      expiresAt:
        Date.now() + System.defaults.setupTimeoutMinutes * 60_000,
    };
    inMemory.pending.set(message.author.id, newPending);
    await sendPendingPrompt(message.author, newPending);
    return;
  }

  if (message.guild) {
    const config = getGuildConfig(message.guild.id);
    if (message.channel.isThread()) {
      const data = loadData();
      ensureGuild(data, message.guild.id);
      const ticket = Object.values(data.tickets[message.guild.id]).find(
        (entry) => entry.threadId === message.channel.id
      );
      if (!ticket || ticket.status !== "open") return;
      if (!isSupport(message.member, config)) return;
      if (ticket.claimedBy && ticket.claimedBy !== message.author.id) return;

      const user = await client.users.fetch(ticket.userId).catch(() => null);
      if (!user) return;

      await user.send(message.content).catch(() => null);
      ticket.messages.push({
        from: "staff",
        content: message.content,
        timestamp: Date.now(),
      });
      ticket.lastActivity = Date.now();
      saveData(data);
    }

    if (message.content.trim().toLowerCase() === "!close") {
      const data = loadData();
      ensureGuild(data, message.guild.id);
      const ticket = Object.values(data.tickets[message.guild.id]).find(
        (entry) => entry.threadId === message.channel.id
      );
      if (!ticket) return;
      if (!isSupport(message.member, config)) return;
      await closeTicket({
        guildId: message.guild.id,
        ticket,
        config,
        reason: "manual close",
      });
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName !== "setup") return;
    const config = getGuildConfig(interaction.guild.id);
    if (!isManager(interaction.member, config)) {
      await interaction.reply({ content: "Not allowed.", ephemeral: true });
      return;
    }
    const supportChannel = interaction.options.getChannel("support_channel");
    const logsChannel = interaction.options.getChannel("logs_channel");
    const supportRole = interaction.options.getRole("support_role");
    const mentionRole = interaction.options.getRole("mention_role");
    const language = interaction.options.getString("language");
    const embedColor = interaction.options.getString("embed_color");

    const data = loadData();
    ensureGuild(data, interaction.guild.id);
    data.guilds[interaction.guild.id].config = {
      ...data.guilds[interaction.guild.id].config,
      supportChannelId: supportChannel.id,
      logsChannelId: logsChannel.id,
      supportRoleIds: [supportRole.id],
      mentionRoleId: mentionRole?.id || "",
      language,
      embedColor: embedColor || config.embedColor,
    };
    if (!data.primaryGuildId) {
      data.primaryGuildId = interaction.guild.id;
    }
    data.guilds[interaction.guild.id].removedAt = null;
    saveData(data);

    await interaction.reply({
      content: "Setup complete ✅",
      ephemeral: true,
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName !== "purge-user") return;
    const config = getGuildConfig(interaction.guild.id);
    if (!isManager(interaction.member, config)) {
      await interaction.reply({ content: "Not allowed.", ephemeral: true });
      return;
    }
    const target = interaction.options.getUser("user");
    const data = loadData();
    ensureGuild(data, interaction.guild.id);
    delete data.tickets[interaction.guild.id][target.id];
    saveData(data);
    await interaction.reply({ content: "User data deleted ✅", ephemeral: true });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith("ticket_lang:")) {
    const lang = interaction.customId.split(":")[1];
    const pending = inMemory.pending.get(interaction.user.id);
    if (!pending || pending.step !== "language") {
      await interaction.reply({ content: messages.ar.invalidChoice, ephemeral: true });
      return;
    }
    pending.language = lang;
    pending.step = "category";
    await interaction.reply({ content: "✅", ephemeral: true });
    await sendPendingPrompt(interaction.user, pending);
    return;
  }
  if (interaction.customId.startsWith("ticket_category:")) {
    const categoryId = interaction.customId.split(":")[1];
    const pending = inMemory.pending.get(interaction.user.id);
    const locale = getLocale(pending?.language || "ar");
    if (!pending || pending.step !== "category") {
      await interaction.reply({ content: messages[locale].invalidChoice, ephemeral: true });
      return;
    }
    if (pending.expiresAt && Date.now() > pending.expiresAt) {
      inMemory.pending.delete(interaction.user.id);
      await interaction.reply({ content: messages[locale].setupExpired, ephemeral: true });
      return;
    }
    pending.category = categoryId;
    pending.step = "reason";
    await interaction.reply({ content: "✅", ephemeral: true });
    await sendPendingPrompt(interaction.user, pending);
    return;
  }
  if (interaction.customId.startsWith("ticket_rate:")) {
    const rating = Number(interaction.customId.split(":")[1]);
    const pending = inMemory.pending.get(interaction.user.id);
    if (!pending || pending.step !== "rating") {
      await interaction.reply({ content: "Not active.", ephemeral: true });
      return;
    }
    const data = loadData();
    ensureGuild(data, pending.guildId);
    const ticket = Object.values(data.tickets[pending.guildId]).find(
      (entry) => entry.id === pending.ticketId
    );
    if (ticket) {
      ticket.rating = rating;
      saveData(data);
    }
    if (rating < 3) {
      pending.step = "rating_reason";
      await interaction.reply({ content: messages[pending.language].ratingLowReason, ephemeral: true });
      return;
    }
    inMemory.pending.delete(interaction.user.id);
    await interaction.reply({ content: "Thanks ✅", ephemeral: true });
    return;
  }
  if (interaction.customId === "ticket_reopen") {
    const guildId = getPrimaryGuildId();
    if (!guildId) {
      await interaction.reply({ content: messages.ar.setupRequired, ephemeral: true });
      return;
    }
    const newPending = {
      step: "language",
      language: "ar",
      userId: interaction.user.id,
      guildId,
      expiresAt: Date.now() + System.defaults.setupTimeoutMinutes * 60_000,
    };
    inMemory.pending.set(interaction.user.id, newPending);
    await interaction.reply({ content: "✅", ephemeral: true });
    await sendPendingPrompt(interaction.user, newPending);
    return;
  }
  if (interaction.customId === "ticket_close_user") {
    const data = loadData();
    const guildId = getPrimaryGuildId();
    if (!guildId) return;
    const ticket = data.tickets[guildId]?.[interaction.user.id];
    if (ticket?.status === "open") {
      const config = getGuildConfig(guildId);
      await closeTicket({ guildId, ticket, config, reason: "user close" });
      await interaction.reply({ content: "Ticket closed ✅", ephemeral: true });
      return;
    }
  }
  if (interaction.customId === "ticket_claim") {
    const data = loadData();
    const config = getGuildConfig(interaction.guild.id);
    if (!isSupport(interaction.member, config)) {
      await interaction.reply({ content: "Not allowed.", ephemeral: true });
      return;
    }
    const ticket = Object.values(data.tickets[interaction.guild.id]).find(
      (entry) => entry.threadId === interaction.channel.id
    );
    if (!ticket) {
      await interaction.reply({ content: "Ticket not found.", ephemeral: true });
      return;
    }
    ticket.claimedBy = interaction.user.id;
    saveData(data);
    const user = await client.users.fetch(ticket.userId).catch(() => null);
    if (user) {
      const locale = getLocale(ticket.language || config.language);
      const claimText = interaction.member.roles.cache.has(config.adminRoleId)
        ? messages[locale].claimNoticeAdmin
        : messages[locale].claimNoticeSupport;
      await user.send(claimText).catch(() => null);
    }
    await interaction.reply({ content: "Claimed ✅", ephemeral: true });
    return;
  }
  if (interaction.customId !== "ticket_close") return;

  const data = loadData();
  ensureGuild(data, interaction.guild.id);
  const config = getGuildConfig(interaction.guild.id);
  const ticket = Object.values(data.tickets[interaction.guild.id]).find(
    (entry) => entry.threadId === interaction.channel.id
  );
  if (!ticket) {
    await interaction.reply({ content: "Ticket not found.", ephemeral: true });
    return;
  }
  if (!isSupport(interaction.member, config)) {
    await interaction.reply({ content: "Not allowed.", ephemeral: true });
    return;
  }
  await closeTicket({
    guildId: interaction.guild.id,
    ticket,
    config,
    reason: "button close",
  });
  await interaction.reply({ content: "Ticket closed.", ephemeral: true });
});

setInterval(async () => {
  const data = loadData();
  const now = Date.now();
  for (const [guildId, tickets] of Object.entries(data.tickets)) {
    const config = getGuildConfig(guildId);
    for (const ticket of Object.values(tickets)) {
      if (ticket.status !== "open") continue;
      if (!ticket.lastActivity) continue;
      const idleLimit = config.idleCloseMinutes * 60_000;
      if (now - ticket.lastActivity > idleLimit) {
        await closeTicket({
          guildId,
          ticket,
          config,
          reason: "idle timeout",
        });
      }
    }
  }
}, 60_000);

setInterval(async () => {
  await cleanupRemovedGuilds();
}, 86_400_000);

client.on("guildCreate", async (guild) => {
  const data = loadData();
  ensureGuild(data, guild.id);
  const meta = data.guilds[guild.id];
  if (meta?.removedAt) {
    const cutoff = System.defaults.removeDataAfterDays * 86_400_000;
    if (Date.now() - meta.removedAt > cutoff) {
      data.tickets[guild.id] = {};
    }
    meta.removedAt = null;
  }
  saveData(data);
});

client.on("guildDelete", async (guild) => {
  const data = loadData();
  ensureGuild(data, guild.id);
  data.guilds[guild.id].removedAt = Date.now();
  saveData(data);
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: "DM For Help", type: 0 }],
    status: "online",
  });
  registerSlashCommands().catch((error) => console.error(error));
});

if (!System.token) {
  console.error("Missing DISCORD_TOKEN env var.");
  process.exit(1);
}

client.login(System.token);
