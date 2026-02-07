const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
    chooseGuild: "اختر السيرفر من القائمة بكتابة الرقم:",
    chooseCategory: "اختر نوع التذكرة بكتابة الرقم:",
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
  },
  en: {
    chooseLanguage: "Choose language: type AR or EN",
    chooseGuild: "Choose the server by typing its number:",
    chooseCategory: "Choose ticket category by typing its number:",
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
  },
};

const closeRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("ticket_close")
    .setLabel("Close")
    .setStyle(ButtonStyle.Danger)
);

function loadData() {
  if (!fs.existsSync(System.dataFile)) {
    return { tickets: {}, guilds: {} };
  }
  try {
    const raw = fs.readFileSync(System.dataFile, "utf-8");
    return raw ? JSON.parse(raw) : { tickets: {}, guilds: {} };
  } catch (error) {
    return { tickets: {}, guilds: {} };
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

function isManager(member) {
  return member?.permissions.has(PermissionsBitField.Flags.ManageGuild);
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
    .setTitle(`Ticket ${ticket.id}`)
    .addFields(
      {
        name: "User",
        value: `${user.tag} (${user.id})`,
      },
      {
        name: locale === "ar" ? "النوع" : "Category",
        value:
          locale === "ar"
            ? categories?.labelAr || ticket.category
            : categories?.labelEn || ticket.category,
      },
      {
        name: locale === "ar" ? "الحالة" : "Status",
        value: ticket.status,
      },
      {
        name: locale === "ar" ? "السبب" : "Reason",
        value: ticket.reason,
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
    await user.send(messages[locale].ticketClosed).catch(() => null);
    await user.send(messages[locale].rating).catch(() => null);
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
      const logEmbed = new EmbedBuilder()
        .setTitle(`Ticket Closed ${ticket.id}`)
        .addFields(
          { name: "User", value: `${ticket.userTag} (${ticket.userId})` },
          { name: "Reason", value: reason || "-" }
        )
        .setTimestamp();
      await logsChannel.send({ embeds: [logEmbed] }).catch(() => null);
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
      .addRoleOption((option) =>
        option
          .setName("mention_role")
          .setDescription("Role to mention on new tickets")
          .setRequired(false)
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
    const choice = message.content.trim().toLowerCase();
    if (choice !== "ar" && choice !== "en") {
      await message.author.send(messages[locale].invalidChoice).catch(() => null);
      return true;
    }
    pending.language = choice;
    pending.step = "guild";
    await sendPendingPrompt(message.author, pending);
    return true;
  }

  if (pending.step === "guild") {
    const guilds = client.guilds.cache.map((guild) => guild);
    const index = Number(message.content.trim()) - 1;
    const selected = guilds[index];
    if (!selected) {
      await message.author.send(messages[locale].invalidChoice).catch(() => null);
      return true;
    }
    pending.guildId = selected.id;
    pending.step = "category";
    await sendPendingPrompt(message.author, pending);
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

  return true;
}

async function sendPendingPrompt(user, pending) {
  const locale = getLocale(pending.language || "ar");
  if (pending.step === "language") {
    await user.send(messages[locale].chooseLanguage).catch(() => null);
    return;
  }
  if (pending.step === "guild") {
    const guilds = client.guilds.cache.map((guild, index) => `${index + 1}) ${guild.name}`);
    await user
      .send(`${messages[locale].chooseGuild}\n${guilds.join("\n")}`)
      .catch(() => null);
    return;
  }
  if (pending.step === "category") {
    const config = getGuildConfig(pending.guildId);
    const list = config.ticketCategories.map((category, index) => {
      const label = locale === "ar" ? category.labelAr : category.labelEn;
      return `${index + 1}) ${label}`;
    });
    await user
      .send(`${messages[locale].chooseCategory}\n${list.join("\n")}`)
      .catch(() => null);
    return;
  }
  if (pending.step === "reason") {
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
  const ticket = {
    id: ticketId,
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
  await thread.send({ content: mention, embeds: [embed], components: [closeRow] });

  if (config.waitingThreshold) {
    const openTickets = Object.values(data.tickets[pending.guildId]).filter(
      (entry) => entry.status === "open"
    ).length;
    if (openTickets >= config.waitingThreshold) {
      await user.send(messages[locale].waiting).catch(() => null);
    }
  }

  await user.send(messages[locale].ticketOpened).catch(() => null);
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

  await thread.send({ embeds: [embed] });

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

    const openGuilds = Object.entries(data.tickets).filter(([, tickets]) =>
      tickets[message.author.id]?.status === "open"
    );
    if (openGuilds.length) {
      const [guildId, ticket] = openGuilds[0];
      ticket.guildId = guildId;
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
    if (!isManager(interaction.member)) {
      await interaction.reply({ content: "Not allowed.", ephemeral: true });
      return;
    }
    const supportChannel = interaction.options.getChannel("support_channel");
    const logsChannel = interaction.options.getChannel("logs_channel");
    const supportRole = interaction.options.getRole("support_role");
    const mentionRole = interaction.options.getRole("mention_role");
    const language = interaction.options.getString("language");

    const data = loadData();
    ensureGuild(data, interaction.guild.id);
    data.guilds[interaction.guild.id].config = {
      ...data.guilds[interaction.guild.id].config,
      supportChannelId: supportChannel.id,
      logsChannelId: logsChannel.id,
      supportRoleIds: [supportRole.id],
      mentionRoleId: mentionRole?.id || "",
      language,
    };
    data.guilds[interaction.guild.id].removedAt = null;
    saveData(data);

    await interaction.reply({
      content: "Setup complete ✅",
      ephemeral: true,
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
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
  registerSlashCommands().catch((error) => console.error(error));
});

if (!System.token) {
  console.error("Missing DISCORD_TOKEN env var.");
  process.exit(1);
}

client.login(System.token);
