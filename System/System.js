const path = require("path");

module.exports = {
  token: process.env.DISCORD_TOKEN,
  dataFile: path.join(__dirname, "..", "Date", "date.json"),
  defaults: {
    language: "ar",
    supportRoleIds: [],
    supportChannelId: "",
    logsChannelId: "",
    mentionRoleId: "",
    ticketCategories: [
      { id: "general", labelAr: "استفسار عام", labelEn: "General" },
      { id: "billing", labelAr: "مدفوعات", labelEn: "Billing" },
      { id: "technical", labelAr: "مشكلة تقنية", labelEn: "Technical" },
    ],
    idleCloseMinutes: 60,
    maxMessagesPerMinute: 8,
    maxTicketsPerDay: 3,
    waitingThreshold: 5,
    removeDataAfterDays: 10,
  },
  guilds: {
    // "GUILD_ID": {
    //   language: "ar",
    //   supportRoleIds: ["ROLE_ID"],
    //   supportChannelId: "CHANNEL_ID",
    //   logsChannelId: "CHANNEL_ID",
    //   mentionRoleId: "ROLE_ID",
    //   ticketCategories: [
    //     { id: "general", labelAr: "استفسار عام", labelEn: "General" },
    //   ],
    // },
  },
};