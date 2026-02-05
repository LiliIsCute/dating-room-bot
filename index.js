require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Partials } = require('discord.js');
const mongoose = require('mongoose');

/* ---------------- DATABASE ---------------- */

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  wallet: { type: Number, default: 1000 },
  bank: { type: Number, default: 0 },
  wagered: { type: Number, default: 0 },
  lastWork: { type: Number, default: 0 },
  lastDaily: { type: Number, default: 0 },

  // mining specific
  lastMine: { type: Number, default: 0 },
  inventory: {
    stone: { type: Number, default: 0 },
    copper: { type: Number, default: 0 },
    silver: { type: Number, default: 0 },
    gold: { type: Number, default: 0 }
  },

  // dating system (top-level)
  partnerId: { type: String, default: null },
  marriedAt: { type: Number, default: null },

  relationshipStats: {
    hugs: { type: Number, default: 0 },
    kisses: { type: Number, default: 0 },
    slaps: { type: Number, default: 0 },
    hits: { type: Number, default: 0 },
    bites: { type: Number, default: 0 } // added bite stat
  },

  // message count for partner stats
  messageCount: { type: Number, default: 0 },

  // streaks (added)
  mineStreak: { type: Number, default: 0 },

  // shop/pickaxe/luck
  pickaxe: {
    level: { type: Number, default: 1 }
  },
  luckCharms: { type: Number, default: 0 } // small buff item
});
const User = mongoose.model('User', userSchema);

/* ---------------- CLIENT ---------------- */

// include Partials so DMs / users fetch works reliably in some edge cases
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [ Partials.Channel, Partials.User, Partials.Message ]
});
const PREFIX = process.env.PREFIX || '!';

mongoose.connect(process.env.MONGO_URI).then(()=>console.log("MongoDB connected"))
  .catch(err => { console.error('MongoDB error', err); process.exit(1); });

/* ---------------- UI COLORS / EMBED ---------------- */

function embedUI(title, description = '\u200B', type = 'neutral') {
  // type: 'win'|'lose'|'tie'|'neutral'|'cool'
  let color = '#ff7ab6';
  if (type === 'win') color = '#57F287';
  if (type === 'lose') color = '#ED4245';
  if (type === 'tie') color = '#FFFFFF';
  if (type === 'cool') color = '#7AA2FF';

  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(`💖 Dating Room — ${title}`)
    .setDescription(description)
    .setFooter({ text: 'Dating Room' })
    .setTimestamp();

  return e;
}

/* ---------------- HELPERS ---------------- */

async function fetchUser(id){
  let u = await User.findOne({ userId:id });
  if(!u) u = await User.create({ userId:id });
  // ensure new fields exist (backfill)
  u.inventory = u.inventory || { stone:0, copper:0, silver:0, gold:0 };
  u.pickaxe = u.pickaxe || { level: 1 };
  u.luckCharms = u.luckCharms || 0;
  u.mineStreak = u.mineStreak || 0;
  u.relationshipStats = u.relationshipStats || { hugs:0, kisses:0, slaps:0, hits:0, bites:0 };
  u.messageCount = u.messageCount || 0;
  return u;
}

/**
 * parseAmount supports:
 *  - numbers with commas: "1,000"
 *  - suffix k/m: "1k" => 1000, "2.5k" => 2500, "1M" => 1000000
 *  - 'all' and 'half' (returns based on provided wallet param)
 */
function parseAmount(arg, wallet){
  if (!arg) return null;
  if (typeof arg === 'number') return Math.floor(arg);
  const s = String(arg).trim().toLowerCase();

  if (s === 'all') return wallet;
  if (s === 'half') return Math.floor(wallet / 2);

  // remove commas and spaces
  const cleaned = s.replace(/,/g, '').replace(/\s+/g, '');

  // match number + optional suffix
  const m = cleaned.match(/^([0-9]*\.?[0-9]+)([km])?$/i);
  if (!m) return null;

  let num = parseFloat(m[1]);
  const suffix = m[2];
  if (suffix) {
    if (suffix.toLowerCase() === 'k') num *= 1000;
    if (suffix.toLowerCase() === 'm') num *= 1000000;
  }
  if (!isFinite(num)) return null;
  return Math.floor(num);
}

function formatCurrency(n){ return `$${Number(n).toLocaleString('en-US')}`; }

function cooldownLeft(last, cdMs){
  const remaining = cdMs - (Date.now() - last);
  if (remaining <= 0) return null;
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return `${m}m ${s}s`;
}

/* ---------------- DATING GIFS ----------------
   Replace or add GIF urls as you like.
*/
const datingGifs = {
  hug: [
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXhubWx2MmEwcmJ0MWthOGU3aXJjN2UycmJ2YnJhMHVobnp6NDVsNiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/49mdjsMrH7oze/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXhubWx2MmEwcmJ0MWthOGU3aXJjN2UycmJ2YnJhMHVobnp6NDVsNiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/BXrwTdoho6hkQ/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXhubWx2MmEwcmJ0MWthOGU3aXJjN2UycmJ2YnJhMHVobnp6NDVsNiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/lrr9rHuoJOE0w/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXhubWx2MmEwcmJ0MWthOGU3aXJjN2UycmJ2YnJhMHVobnp6NDVsNiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/IRUb7GTCaPU8E/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXhubWx2MmEwcmJ0MWthOGU3aXJjN2UycmJ2YnJhMHVobnp6NDVsNiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/qscdhWs5o3yb6/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXhubWx2MmEwcmJ0MWthOGU3aXJjN2UycmJ2YnJhMHVobnp6NDVsNiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/JPQZ8VPIMZkzDnyRuQ/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dWsxazYyYm1vcWtyY2MzdWpnMnRtZnRwZnYwYnFvaG5hc3htbnF1MyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/hGjhjaBBc7zyg/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dWsxazYyYm1vcWtyY2MzdWpnMnRtZnRwZnYwYnFvaG5hc3htbnF1MyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/m2GGGWxexjwqnHQnZI/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dWsxazYyYm1vcWtyY2MzdWpnMnRtZnRwZnYwYnFvaG5hc3htbnF1MyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/5eyhBKLvYhafu/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dWsxazYyYm1vcWtyY2MzdWpnMnRtZnRwZnYwYnFvaG5hc3htbnF1MyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/ILc2onXX6sDQJcgmyk/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cHBzcDM2ZWduc2xhMDVjb3htMGx3bmZrZmgzcTVkNmd2d2s1MWlhdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/od5H3PmEG5EVq/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cHBzcDM2ZWduc2xhMDVjb3htMGx3bmZrZmgzcTVkNmd2d2s1MWlhdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/7z5ICi5kf3RXctLKwL/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cHBzcDM2ZWduc2xhMDVjb3htMGx3bmZrZmgzcTVkNmd2d2s1MWlhdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/JTjSlqiz63j5m/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cHBzcDM2ZWduc2xhMDVjb3htMGx3bmZrZmgzcTVkNmd2d2s1MWlhdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/BhNPh0OYrAIz0iArla/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3a20wd2x0aGZvdGFkemFlbmd5cm1keW9qazh4OGh5aW5weGJyY3B4eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/9GniYebxnt2Za/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3a20wd2x0aGZvdGFkemFlbmd5cm1keW9qazh4OGh5aW5weGJyY3B4eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/nZG37fsx2kkFzQ85iI/giphy.gif"
  ],
  kiss: [
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeGRheXhicmc4OThuanU0cWx5ejBpcXdsdGN6ZWI5ZDRhMmkyYnNyYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/G3va31oEEnIkM/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeGRheXhicmc4OThuanU0cWx5ejBpcXdsdGN6ZWI5ZDRhMmkyYnNyYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/JFmIDQodMScJW/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeGRheXhicmc4OThuanU0cWx5ejBpcXdsdGN6ZWI5ZDRhMmkyYnNyYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/0r4i1pGnSGQsBNrLpm/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeGRheXhicmc4OThuanU0cWx5ejBpcXdsdGN6ZWI5ZDRhMmkyYnNyYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Mo122cd9G2xmKymanO/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cWFzMzBmazFleGF1eW1sZnA5ZTd5MGoxZjE1M2Fhd3Fja242YzB5aiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/FqBTvSNjNzeZG/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cWFzMzBmazFleGF1eW1sZnA5ZTd5MGoxZjE1M2Fhd3Fja242YzB5aiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/bm2O3nXTcKJeU/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cWFzMzBmazFleGF1eW1sZnA5ZTd5MGoxZjE1M2Fhd3Fja242YzB5aiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Z6ifX4I0TC5I4/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cnlhb3Y1cWg1Zmtpa2dtc2N0YXhpa2k3Z3BwZ2VpNHRiNHQ4NTR2aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/jR22gdcPiOLaE/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3cnlhb3Y1cWg1Zmtpa2dtc2N0YXhpa2k3Z3BwZ2VpNHRiNHQ4NTR2aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/7z1xs4Fl9Kb8A/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bjU5bGNnZHFnMWtjcWNnYmRzcWkyejcxdzdlaWxjYmsyM29xYnMxMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/KmeIYo9IGBoGY/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bjU5bGNnZHFnMWtjcWNnYmRzcWkyejcxdzdlaWxjYmsyM29xYnMxMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/ZL0G3c9BDX9ja/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3NWQ2MHI1ZXlxaXNjbTF2bnQ4dWZpYmRqeXNsY3pidm8xaHVwMHppNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/QGc8RgRvMonFm/giphy.gif"
  ],
  slap: [
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHh0dHJndmFxd3I0cXNtdHJyNG8ycDhqaHlqZWJ2bGZieWY2aTN5bSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Zau0yrl17uzdK/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHh0dHJndmFxd3I0cXNtdHJyNG8ycDhqaHlqZWJ2bGZieWY2aTN5bSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xUNd9HZq1itMkiK652/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHh0dHJndmFxd3I0cXNtdHJyNG8ycDhqaHlqZWJ2bGZieWY2aTN5bSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Gf3AUz3eBNbTW/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bTN4YWdmeGx5Yzc2azl6YnpoeTloaWxsc25xc21zZHA4N2tmN3JrcyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/EONkCBe2XNky48CyUq/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3JhcmdibDdrbW4zcTRnbTFpa3I2N3ltajJoaHR5MXQwdzQxZ29jOCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3XlEk2RxPS1m8/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3JhcmdibDdrbW4zcTRnbTFpa3I2N3ltajJoaHR5MXQwdzQxZ29jOCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/mEtSQlxqBtWWA/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3JhcmdibDdrbW4zcTRnbTFpa3I2N3ltajJoaHR5MXQwdzQxZ29jOCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/jauNHUg3yB9ZmDtzOv/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3JhcmdibDdrbW4zcTRnbTFpa3I2N3ltajJoaHR5MXQwdzQxZ29jOCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/srD8JByP9u3zW/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3dnF5OHE1cnJ2eXJjNzY5bXlwOGR3Z2R1cnZrOWUwM2hzeWw3ODR6OSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/tX9Myr2kUio7Q1JYSs/giphy.gif"
  ],
  hit: [
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2hrNzVidnI5OHNpdWtsZGxpa2FkMGtoNmU3ZGsxZ2wxNG9xdTd2NiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/XDRoTw2Fs6rlIW7yQL/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2hrNzVidnI5OHNpdWtsZGxpa2FkMGtoNmU3ZGsxZ2wxNG9xdTd2NiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3mTrw0WvK4d4eCMsOI/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTBjYnRna3B0amFvaGtjM3AzdGVtNjh1cGV1MmdjeHE2MGFwMnBtZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/VRu437rDS6eZdn82NG/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTBjYnRna3B0amFvaGtjM3AzdGVtNjh1cGV1MmdjeHE2MGFwMnBtZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/SzC42gUrhHopW/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTBjYnRna3B0amFvaGtjM3AzdGVtNjh1cGV1MmdjeHE2MGFwMnBtZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/4Oc0NSrwFpuQGI4bHF/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTBjYnRna3B0amFvaGtjM3AzdGVtNjh1cGV1MmdjeHE2MGFwMnBtZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3ohc0QQkTH6YK8g4zS/giphy.gif"
  ],
  marry: [
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXQ3NDR6eTU0MjVrMXFsazRsYzdpZW5kdnA4Ym92dmRlbTNxZXY1NiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/UJG50B8TJD5Mk/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcTRzd3Bwc2gya2RnbmR2YXI5YTYyczEwN2IyNHQyeHEyemtzMWRicyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/t4FzCqrpeFvCo/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWI0Mmk0N3l2dTJwM3VzZ3JnNnhkNWoxYmIwdnI1d3Y2aXpqZWRhYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/TR3abToJDTBII/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWI0Mmk0N3l2dTJwM3VzZ3JnNnhkNWoxYmIwdnI1d3Y2aXpqZWRhYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/XH3jHyWBXOQBifW6Fe/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWI0Mmk0N3l2dTJwM3VzZ3JnNnhkNWoxYmIwdnI1d3Y2aXpqZWRhYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/APWIyfzXk8lMI/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3eGw2NXRqZXBwOHZ2dDlzMWw0c25vdTExZjg2NnZ0cnBmanZ2ZjNpeiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/KYYpQJwBAkZLG/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3YzRwOGFuNThyNXNndGRqaWE3ZTRyeWV0NXB1MnducjY3YnJzdWp3ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/ad6iO5T9aWRdm/giphy.gif"
  ],
  bite: [
    "https://tenor.com/view/vanitas-no-carte-anime-bite-gif-4339003390132333223",
    "https://tenor.com/view/cat-kitten-kittens-bite-chomp-gif-13228170122565162919",
      "https://tenor.com/view/anime-bite-gif-25923605",
      "https://tenor.com/view/bite-cat-gotcha-playing-catsdoingthings-gif-16767804"
  ]
};


function randomGif(action) {
  const list = datingGifs[action];
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/* ---------------- BLACKJACK HELPERS / DECK ---------------- */

const blackjackGames = new Map(); // userId → game state

const suits = ['♠️','♥️','♦️','♣️'];
const ranks = [
  {r:'A', v:11}, {r:'2', v:2}, {r:'3', v:3}, {r:'4', v:4}, {r:'5', v:5},
  {r:'6', v:6}, {r:'7', v:7}, {r:'8', v:8}, {r:'9', v:9}, {r:'10', v:10},
  {r:'J', v:10}, {r:'Q', v:10}, {r:'K', v:10}
];

function drawCard(){
  const suit = suits[Math.floor(Math.random()*suits.length)];
  const card = ranks[Math.floor(Math.random()*ranks.length)];
  return { label:`${card.r}${suit}`, value:card.v, rank:card.r };
}

function handTotal(hand){
  let total = hand.reduce((a,c)=>a+c.value,0);
  let aces = hand.filter(c=>c.rank==='A').length;
  while(total>21 && aces>0){ total-=10; aces--; }
  return total;
}

function buildBjRow(playerLength, disabledDouble=false){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bj_double').setLabel('Double').setStyle(ButtonStyle.Danger).setDisabled(disabledDouble || playerLength !== 2)
  );
}

/* ---------------- MINING HELPERS / DECK ---------------- */

const ORE_DEFINITIONS = [
  { key: 'stone', emoji: '🪨', weight: 55, min: 1, max: 4, value: 5 },      // common — low value
  { key: 'copper', emoji: '🟠', weight: 30, min: 1, max: 3, value: 20 },   // uncommon
  { key: 'silver', emoji: '⚪', weight: 12, min: 1, max: 2, value: 75 },   // rare
  { key: 'gold', emoji: '🟡', weight: 3, min: 1, max: 1, value: 200 }      // very rare — small payout
];

const PICKAXE_LEVELS = [
  { level: 1, name: 'Rusty Pickaxe', cost: 0, bonus: 0 },
  { level: 2, name: 'Bronze Pickaxe', cost: 2500, bonus: 1 },
  { level: 3, name: 'Iron Pickaxe', cost: 7000, bonus: 2 },
  { level: 4, name: 'Steel Pickaxe', cost: 16000, bonus: 3 }
];

function weightedPick() {
  const total = ORE_DEFINITIONS.reduce((s,o)=>s+o.weight,0);
  let r = Math.random()*total;
  for (const o of ORE_DEFINITIONS) {
    if (r < o.weight) return o;
    r -= o.weight;
  }
  return ORE_DEFINITIONS[0];
}

function buildMineRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mine_sell_all').setLabel('Sell All').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('mine_open_inv').setLabel('Inventory').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop_open').setLabel('Shop').setStyle(ButtonStyle.Success)
  );
}

/* ---------------- SMALL EVENTS / STREAKS ----------------
   Behavior:
   - mineStreak increments if you mine again within `STREAK_WINDOW_MS` (6 hours), otherwise resets to 1
   - every 3 streaks = +1 extra ore (keeps bonuses modest)
   - each mine: 50% chance to lose your streak (resets to 0)
   - each mine: 15% chance to trip and lose $10-$15
   - small random events on each mine (rare gem, lucky find, coin find, trap)
   - luckCharms slightly improve lucky-find chances
*/

const STREAK_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/* ---------------- NEW GAME MAPS ---------------- */

const rpsGames = new Map(); // gameId -> { challengerId, opponentId, bet, choices: { challenger, opponent }, messageId }
const bshipGames = new Map(); // gameId -> battleship state

/* ---------------- COMMANDS ---------------- */

client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;

    // fetch user early and increment message count (counts all messages)
    const user = await fetchUser(message.author.id);
    user.messageCount = (user.messageCount || 0) + 1;
    // save messageCount update immediately (keeps partner stats meaningful)
    await user.save();

    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (args.shift() || '').toLowerCase();

    /* ---------------- DATING COMMANDS ---------------- */
    const datingCmds = ['hug','kiss','slap','hit','marry','divorce','partner','bite'];

    if (datingCmds.includes(cmd)) {
      // ---------- PARTNER INFO ----------
      if (cmd === 'partner') {
        if (!user.partnerId)
          return message.reply({ embeds: [embedUI('Partner', 'You are not married.', 'neutral')] });

        const partner = await fetchUser(user.partnerId);

        const e = embedUI("Partner Info", `Partner: <@${user.partnerId}>`, 'neutral')
          .addFields(
            { name: "Your Hugs", value: `${user.relationshipStats.hugs}`, inline: true },
            { name: "Your Kisses", value: `${user.relationshipStats.kisses}`, inline: true },
            { name: "Your Slaps", value: `${user.relationshipStats.slaps}`, inline: true },
            { name: "Your Hits", value: `${user.relationshipStats.hits}`, inline: true },
            { name: "Your Bites", value: `${user.relationshipStats.bites}`, inline: true },
            { name: "Partner Message Count", value: `${partner.messageCount || 0}`, inline: true },
            { name: "Married At", value: `${user.marriedAt ? new Date(user.marriedAt).toUTCString() : 'N/A'}`, inline: true }
          );

        return message.reply({ embeds: [e] });
      }

      // ---------- DIVORCE ----------
      if (cmd === 'divorce') {
        if (!user.partnerId)
          return message.reply({ embeds: [embedUI('Divorce', "You're not married.", 'neutral')] });

        const partner = await fetchUser(user.partnerId);

        // clear both sides (if partner exists)
        const oldPartnerId = user.partnerId;
        user.partnerId = null;
        user.marriedAt = null;

        if (partner) {
          partner.partnerId = null;
          partner.marriedAt = null;
          await partner.save();
        }

        await user.save();

        return message.reply({ content: `💔 You divorced <@${oldPartnerId}>.` });
      }

      // ---------- ACTIONS & MARRY ----------
      // MARRY is special: propose via DM; handle before generic restrictions
      if (cmd === 'marry') {
        const target = message.mentions.users.first();
        if (!target) return message.reply(`Usage: !marry @user`);
        if (target.id === message.author.id) return message.reply("You can't marry yourself.");
        const proposer = user;
        const targetUser = await fetchUser(target.id);

        if (proposer.partnerId) return message.reply("You're already married.");
        if (targetUser.partnerId) return message.reply("They are already married.");

        // Create DM buttons for the target
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`marry_accept_${message.author.id}`)
            .setLabel("Accept 💍")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`marry_decline_${message.author.id}`)
            .setLabel("Decline")
            .setStyle(ButtonStyle.Danger)
        );

        try {
          await target.send({
            content: `💍 <@${message.author.id}> proposed to you!`,
            components: [row]
          });
          return message.reply("Proposal sent via DM!");
        } catch (err) {
          return message.reply("I can't DM them. (They may have DMs disabled.)");
        }
      }

      // ---------- ACTION COMMANDS (hug/kiss/slap/hit/bite) ----------
      // usage: !hug @user etc.
      const targetUserMention = message.mentions.users.first();
      if (!targetUserMention) return message.reply(`Usage: !${cmd} @user`);
      if (targetUserMention.id === message.author.id) return message.reply("You can't do that to yourself.");

      const targetUser = await fetchUser(targetUserMention.id);

      // hug/kiss restriction: ONLY restricted if the sender has a partner.
      // If sender has a partner, they may only hug/kiss their partner; otherwise they may hug/kiss anyone.
      if (['hug','kiss'].includes(cmd) && user.partnerId) {
        if (user.partnerId !== targetUserMention.id) {
          return message.reply({ embeds: [embedUI(cmd.charAt(0).toUpperCase()+cmd.slice(1), "You can only do that with your partner.", 'neutral')] });
        }
      }

      // increment sender's counters and (optionally) recipient's counters
      const mapToStat = { hug: 'hugs', kiss: 'kisses', slap: 'slaps', hit: 'hits', bite: 'bites' };
      const statKey = mapToStat[cmd] || null;
      if (statKey) {
        user.relationshipStats[statKey] = (user.relationshipStats[statKey] || 0) + 1;
        // intentionally not incrementing target's stats to avoid double-counting
      }

      await user.save();

      // send embed with GIF (if present).
      const gif = randomGif(cmd);
      const embed = embedUI("Dating Action")
        .setDescription(`<@${message.author.id}> ${cmd}s <@${targetUserMention.id}>!`);

      if (gif) embed.setImage(gif);

      return message.reply({ embeds: [embed] });
    } // end datingCmds

    /* ---------------- BALANCE & ECONOMY COMMANDS BELOW ---------------- */

    if (['bal','balance','b'].includes(cmd)) {
      const mention = message.mentions.users.first();
      const target = mention ? await fetchUser(mention.id) : user;
      const name = mention ? mention.username : message.author.username;

      const e = embedUI(`${name}'s Balance`, '\u200B', 'neutral')
        .addFields(
          { name: 'Wallet', value: `${formatCurrency(target.wallet)}`, inline: true },
          { name: 'Bank', value: `${formatCurrency(target.bank)}`, inline: true },
          { name: 'Wagered', value: `${formatCurrency(target.wagered)}`, inline: true }
        );
      return message.reply({ embeds: [e] });
    }

    /* DEPOSIT */
    if (['deposit','d'].includes(cmd)) {
      const amount = parseAmount(args[0], user.wallet);

      if (!amount || amount <= 0)
        return message.reply({ embeds: [embedUI('Deposit — Usage', '`!deposit <amount|all|half|1k>`', 'neutral')] });

      if (amount > user.wallet)
        return message.reply({ embeds: [embedUI('Deposit', `You only have ${formatCurrency(user.wallet)} in your wallet.`, 'neutral')] });

      user.wallet -= amount;
      user.bank += amount;
      await user.save();

      const e = embedUI('Bank Deposit', '\u200B', 'win')
        .addFields(
          { name: 'Deposited', value: `**${formatCurrency(amount)}**`, inline: true },
          { name: 'Wallet', value: `${formatCurrency(user.wallet)}`, inline: true },
          { name: 'Bank', value: `${formatCurrency(user.bank)}`, inline: true }
        );

      return message.reply({ embeds: [e] });
    }

    /* WITHDRAW */
    if (['withdraw','w'].includes(cmd)) {
      const amount = parseAmount(args[0], user.bank);

      if (!amount || amount <= 0)
        return message.reply({ embeds: [embedUI('Withdraw — Usage', '`!withdraw <amount|all|half|1k>`', 'neutral')] });

      if (amount > user.bank)
        return message.reply({ embeds: [embedUI('Withdraw', `You only have ${formatCurrency(user.bank)} in the bank.`, 'neutral')] });

      user.bank -= amount;
      user.wallet += amount;
      await user.save();

      const e = embedUI('Bank Withdraw', '\u200B', 'neutral')
        .addFields(
          { name: 'Withdrawn', value: `**${formatCurrency(amount)}**`, inline: true },
          { name: 'Wallet', value: `${formatCurrency(user.wallet)}`, inline: true },
          { name: 'Bank', value: `${formatCurrency(user.bank)}`, inline: true }
        );

      return message.reply({ embeds: [e] });
    }

    // GIVE !give @user <amount> or !g
    if (['give','g'].includes(cmd)) {
      const mention = message.mentions.users.first();
      if (!mention) return message.reply('Usage: !give @user <amount>');
      // find amount arg (handles mention at args[0] or args anywhere)
      let amountArg = null;
      // attempt common positions:
      if (args[0] && args[0].includes(mention.id)) amountArg = args[1];
      else amountArg = args[0] || args[1];

      if (!amountArg) return message.reply('Usage: !give @user <amount>');
      if (mention.id === message.author.id) return message.reply("You can't give to yourself.");
      const amount = parseAmount(amountArg, user.wallet);
      if (!amount) return message.reply('Enter a valid amount.');
      if (amount > user.wallet) return message.reply("You don't have that much.");
      const target = await fetchUser(mention.id);
      user.wallet -= amount;
      target.wallet += amount;
      await user.save();
      await target.save();
      return message.reply({ embeds: [embedUI('Give', `You gave <@${mention.id}> **${formatCurrency(amount)}**.`)] });
    }

    /* WORK */
    if (cmd === 'work') {
      const cd = 10 * 60 * 1000;
      const left = cooldownLeft(user.lastWork, cd);
      if (left) return message.reply({ embeds: [embedUI('Work Cooldown', `⏳ ${left} left`, 'neutral')] });

      const earned = Math.floor(Math.random() * 501) + 200; // 200 - 700
      user.wallet += earned;
      user.lastWork = Date.now();
      await user.save();

      const e = embedUI('Work', '\u200B', 'win')
        .addFields(
          { name: 'Earned', value: `${formatCurrency(earned)}`, inline: true },
          { name: 'New Wallet', value: `${formatCurrency(user.wallet)}`, inline: true }
        );
      return message.reply({ embeds: [e] });
    }

    /* DAILY */
    if (cmd === 'daily') {
      const cd = 24 * 60 * 60 * 1000;
      const left = cooldownLeft(user.lastDaily, cd);
      if (left) return message.reply({ embeds: [embedUI('Daily Cooldown', `⏳ ${left} left`, 'neutral')] });

      const earned = Math.floor(Math.random() * (4500 - 700 + 1)) + 700;
      user.wallet += earned;
      user.lastDaily = Date.now();
      await user.save();

      const e = embedUI('Daily', '\u200B', 'win')
        .addFields(
          { name: 'Reward', value: `${formatCurrency(earned)}`, inline: true },
          { name: 'New Wallet', value: `${formatCurrency(user.wallet)}`, inline: true }
        );
      return message.reply({ embeds: [e] });
    }

    /* COINFLIP */
    if (['cf','coinflip'].includes(cmd)) {
      const bet = parseAmount(args[0], user.wallet);
      if (!bet) return message.reply({ embeds: [embedUI('Coinflip — Usage', '`!cf <amount|all|half|1k> <heads|tails|h|t>`', 'neutral')] });
      if (bet > user.wallet) return message.reply({ embeds: [embedUI('Coinflip', `You don't have ${formatCurrency(bet)} in your wallet.`, 'neutral')] });

      let choice = (args[1] || '').toLowerCase();
      if (['h','head','heads'].includes(choice)) choice = 'heads';
      else if (['t','tail','tails'].includes(choice)) choice = 'tails';
      else return message.reply({ embeds: [embedUI('Coinflip — Usage', '`Choose heads or tails (h/t works).`', 'neutral')] });

      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      user.wagered += bet;

      if (result === choice) {
        user.wallet += bet;
        await user.save();

        const e = embedUI('Coinflip', '\u200B', 'win')
          .addFields(
            { name: 'Result', value: `**${result.toLowerCase()}**`, inline: true },
            { name: 'Outcome', value: `**+${formatCurrency(bet)}**`, inline: true },
            { name: 'New Wallet', value: `${formatCurrency(user.wallet)}`, inline: true }
          );
        return message.reply({ embeds: [e] });
      } else {
        user.wallet -= bet;
        await user.save();

        const e = embedUI('Coinflip', '\u200B', 'lose')
          .addFields(
            { name: 'Result', value: `**${result.toLowerCase()}**`, inline: true },
            { name: 'Outcome', value: `**-${formatCurrency(bet)}**`, inline: true },
            { name: 'New Wallet', value: `${formatCurrency(user.wallet)}`, inline: true }
          );
        return message.reply({ embeds: [e] });
      }
    }

    /* SLOTS (animated-ish) */
    if (cmd === 'slots') {
      const bet = parseAmount(args[0], user.wallet);
      if (!bet) return message.reply({ embeds: [embedUI('Slots — Usage', '`!slots <amount|all|half|1k>`', 'neutral')] });
      if (bet > user.wallet) return message.reply({ embeds: [embedUI('Slots', `You don't have ${formatCurrency(bet)}.`, 'neutral')] });

      const symbols = ['🍒','🍋','🔔','💎','7️⃣'];
      user.wagered += bet;

      const spinMsg = await message.reply({ embeds: [embedUI('Slots', '🎰 Spinning...', 'neutral')] });

      const makeRoll = () => [
        symbols[Math.floor(Math.random()*symbols.length)],
        symbols[Math.floor(Math.random()*symbols.length)],
        symbols[Math.floor(Math.random()*symbols.length)]
      ];

      // small animation
      await spinMsg.edit({ embeds: [embedUI('Slots', `🎰 | ${makeRoll().join(' | ')} |`, 'neutral')] });
      await new Promise(r => setTimeout(r, 500));
      await spinMsg.edit({ embeds: [embedUI('Slots', `🎰 | ${makeRoll().join(' | ')} |`, 'neutral')] });
      await new Promise(r => setTimeout(r, 600));
      const final = makeRoll();

      let payout = 0;
      if (final[0] === final[1] && final[1] === final[2]) payout = bet * 5;
      else if (final[0] === final[1] || final[1] === final[2] || final[0] === final[2]) payout = bet * 2;

      if (payout > 0) {
        user.wallet += (payout - bet);
        await user.save();
        const e = embedUI('SLOTS', '\u200B', 'win')
          .addFields(
            { name: 'Spin', value: `🎰 ${final.join(' | ')}`, inline: false },
            { name: 'Payout', value: `**${formatCurrency(payout - bet)}**`, inline: true },
            { name: 'New Wallet', value: `${formatCurrency(user.wallet)}`, inline: true }
          );
        return spinMsg.edit({ embeds: [e] });
      } else {
        user.wallet -= bet;
        await user.save();
        const e = embedUI('SLOTS', '\u200B', 'lose')
          .addFields(
            { name: 'Spin', value: `🎰 ${final.join(' | ')}`, inline: false },
            { name: 'Lost', value: `**${formatCurrency(bet)}**`, inline: true },
            { name: 'New Wallet', value: `${formatCurrency(user.wallet)}`, inline: true }
          );
        return spinMsg.edit({ embeds: [e] });
      }
    }

    /* ROLL (dice gambling)
       Usage: !roll <sides> <bet?>  e.g. !roll 20 100
       If bet provided, higher roll wins bet (ties return bet).
    */
    if (cmd === 'roll') {
      const sides = parseInt(args[0], 10);
      if (!sides || sides < 2 || sides > 1000) return message.reply({ embeds: [embedUI('Roll — Usage', '`!roll <sides (2-1000)> [bet]`', 'neutral')] });

      if (args[1]) {
        const bet = parseAmount(args[1], user.wallet);
        if (!bet || bet <= 0) return message.reply({ embeds: [embedUI('Roll', 'Invalid bet.', 'neutral')] });
        if (bet > user.wallet) return message.reply({ embeds: [embedUI('Roll', `You don't have ${formatCurrency(bet)}.`, 'neutral')] });

        // perform rolls
        const playerRoll = Math.floor(Math.random() * sides) + 1;
        const botRoll = Math.floor(Math.random() * sides) + 1;

        user.wagered += bet;

        if (playerRoll > botRoll) {
          user.wallet += bet;
          await user.save();
          return message.reply({ embeds: [embedUI('Roll', `You rolled **${playerRoll}** vs **${botRoll}** — You WIN **${formatCurrency(bet)}**!`, 'win')] });
        } else if (playerRoll < botRoll) {
          user.wallet -= bet;
          await user.save();
          return message.reply({ embeds: [embedUI('Roll', `You rolled **${playerRoll}** vs **${botRoll}** — You LOSE **${formatCurrency(bet)}**.`, 'lose')] });
        } else {
          // tie, no wallet changes
          return message.reply({ embeds: [embedUI('Roll', `You rolled **${playerRoll}** vs **${botRoll}** — It's a TIE.`, 'tie')] });
        }
      } else {
        // no bet: just roll
        const playerRoll = Math.floor(Math.random() * sides) + 1;
        return message.reply({ embeds: [embedUI('Roll', `You rolled **${playerRoll}** (1-${sides})`, 'neutral')] });
      }
    }

    /* BLACKJACK - start a game (buttons handled in interactionCreate) */
    if (cmd === 'blackjack' || cmd === 'bj') {
      if (blackjackGames.has(message.author.id))
        return message.reply("You're already in a game.");

      const bet = parseAmount(args[0], user.wallet);
      if (!bet || bet <= 0 || bet > user.wallet) return message.reply("Invalid bet.");

      // take bet immediately
      user.wallet -= bet;
      user.wagered += bet;
      await user.save();

      const player = [drawCard(), drawCard()];
      const dealer = [drawCard(), drawCard()];

      blackjackGames.set(message.author.id, {
        bet, // current total bet (may be doubled)
        player,
        dealer,
        owner: message.author.id
      });

      const embed = new EmbedBuilder()
        .setColor('#ff7ab6')
        .setTitle('🃏 Blackjack')
        .setDescription(`**Bet:** ${formatCurrency(bet)}\n\n`+
          `**Your Hand**\n${player.map(c=>c.label).join(' ')} (${handTotal(player)})\n\n`+
          `**Dealer**\n${dealer[0].label} ❓`);

      const row = buildBjRow(player.length, false);

      const msg = await message.reply({ embeds:[embed], components:[row] });
      // store message id in case you want to reference it later
      const game = blackjackGames.get(message.author.id);
      game.messageId = msg.id;
      blackjackGames.set(message.author.id, game);
      return;
    }

    /* RPS - play vs bot or challenge another user
       Usages:
         - !rps rock
         - !rps rock 100
         - !rps @user 100   (challenge)
         - !rps @user       (challenge, no bet)
    */
    if (cmd === 'rps') {
      const mention = message.mentions.users.first();
      // If mention present and no direct choice word, treat as challenge
      const possibleChoice = (args[0] && !mention) ? args[0].toLowerCase() : (mention ? args[1] : null);

      // If mention and no explicit 'rock/paper/scissors' term, create challenge
      if (mention && (!possibleChoice || !['rock','paper','scissors','r','p','s'].includes(possibleChoice))) {
        // parse optional bet (could be args[1] or args[2] depending on mention position)
        let betArg = null;
        // try to find amount in args that is not the mention string
        for (const a of args) {
          if (!a.includes(mention.id) && a !== `<@${mention.id}>` && a !== `<@!${mention.id}>`) {
            betArg = a;
            break;
          }
        }
        const bet = betArg ? parseAmount(betArg, user.wallet) : 0;
        if (betArg && (!bet || bet < 0)) return message.reply({ embeds: [embedUI('RPS', 'Invalid bet.', 'neutral')] });
        if (bet > user.wallet) return message.reply({ embeds: [embedUI('RPS', "You don't have enough.", 'neutral')] });

        const gameId = `${message.author.id}_${mention.id}_${Date.now()}`;
        rpsGames.set(gameId, { challengerId: message.author.id, opponentId: mention.id, bet: bet || 0, choices: {} });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`rps_accept_${gameId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`rps_decline_${gameId}`).setLabel('Decline').setStyle(ButtonStyle.Danger)
        );

        return message.reply({ embeds: [embedUI('RPS Challenge', `<@${mention.id}>, you have been challenged to Rock Paper Scissors by <@${message.author.id}>${bet?` for ${formatCurrency(bet)}`:''}`,'neutral')], components: [row] });
      }

      // else play vs bot
      const choiceRaw = possibleChoice || args[0];
      let choice = (choiceRaw || '').toLowerCase();
      if (['r','rock','rocks','rockk'].includes(choice)) choice = 'rock';
      else if (['p','paper'].includes(choice)) choice = 'paper';
      else if (['s','scissors','scissor'].includes(choice)) choice = 'scissors';
      else return message.reply({ 
  embeds: [embedUI(
    'RPS — Usage',
    '`!rps <rock|paper|scissors> [bet]` or `!rps @user [bet]` to challenge',
    'neutral'
  )] 
});


      let bet = 0;
      if (args.includes('k') || args.includes('m')) {
        // ignore weird things: handled below by parseAmount
      }
      // find a numeric bet in args (last arg if not choice)
      if (args.length > 1) {
        // attempt to find a bet that's not the choice
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a.toLowerCase() !== choiceRaw) {
            const maybe = parseAmount(a, user.wallet);
            if (maybe) { bet = maybe; break; }
          }
        }
      }

      if (bet > 0 && bet > user.wallet) return message.reply({ embeds: [embedUI('RPS', "You don't have enough.", 'neutral')] });

      const botChoice = ['rock','paper','scissors'][Math.floor(Math.random()*3)];
      const winMatrix = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      let type = 'tie';
      let text = '';

      user.wagered += bet;

      if (choice === botChoice) {
        type = 'tie';
        text = `It's a tie — we both chose **${botChoice.toUpperCase()}**.`;
      } else if (winMatrix[choice] === botChoice) {
        type = 'win';
        user.wallet += bet;
        if (bet > 0) await user.save();
        text = `You **WIN** — I chose **${botChoice.toUpperCase()}**. ${bet>0?`You gained **${formatCurrency(bet)}**.`:''}`;
      } else {
        type = 'lose';
        user.wallet -= bet;
        if (bet > 0) await user.save();
        text = `You **LOSE** — I chose **${botChoice.toUpperCase()}**. ${bet>0?`You lost **${formatCurrency(bet)}**.`:''}`;
      }

      return message.reply({ embeds: [embedUI('RPS', text, type)] });
    }

    /* ROULETTE */
    if (cmd === 'roulette') {
      const bet = parseAmount(args[0], user.wallet);
      const color = (args[1] || '').toLowerCase();
      if (!bet) return message.reply({ embeds: [embedUI('Roulette — Usage', '`!roulette <amount|all|half|1k> <red|black|green>`', 'neutral')] });
      if (bet > user.wallet) return message.reply({ embeds: [embedUI('Roulette', `You don't have ${formatCurrency(bet)}.`, 'neutral')] });
      if (!['red','black','green'].includes(color)) return message.reply({ embeds: [embedUI('Roulette — Usage', '`Choose red, black or green.`', 'neutral')] });

      // spin 0..36, where 0 is green, others alternate red/black roughly (for simplicity)
      const spin = Math.floor(Math.random() * 37);
      // simple color mapping: 0 green; even black; odd red (not exact casino mapping, but fine)
      const resultColor = (spin === 0) ? 'green' : (spin % 2 === 0 ? 'black' : 'red');

      user.wagered += bet;
      let e;
      if (resultColor === color) {
        const mult = (color === 'green') ? 14 : 2; // green pays big
        const winAmount = bet * (mult - 1);
        user.wallet += winAmount;
        await user.save();
        e = embedUI('ROULETTE', '\u200B', 'win')
          .addFields(
            { name: 'Result', value: `**${spin} ${resultColor.toUpperCase()}**`, inline: true },
            { name: 'Outcome', value: `**+${formatCurrency(winAmount)}**`, inline: true },
            { name: 'New Wallet', value: `${formatCurrency(user.wallet)}`, inline: true }
          );
      } else {
        user.wallet -= bet;
        await user.save();
        e = embedUI('ROULETTE', '\u200B', 'lose')
          .addFields(
            { name: 'Result', value: `**${spin} ${resultColor.toUpperCase()}**`, inline: true },
            { name: 'Outcome', value: `**-${formatCurrency(bet)}**`, inline: true },
            { name: 'New Wallet', value: `${formatCurrency(user.wallet)}`, inline: true }
          );
      }
      return message.reply({ embeds: [e] });
    }

    /* LEADERBOARD */
    if (['lb','leaderboard'].includes(cmd)) {
      const all = await User.find().lean();
      all.sort((a,b) => (b.wallet + b.bank) - (a.wallet + a.bank));
      const top = all.slice(0, 10);
      if (top.length === 0) return message.reply({ embeds: [embedUI('Leaderboard', 'No players yet.', 'neutral')] });
      const lines = top.map((u,i) => `**${i+1}.** <@${u.userId}> — ${formatCurrency(u.wallet + u.bank)}`).join('\n');
      return message.reply({ embeds: [embedUI('Leaderboard', lines, 'neutral')] });
    }

    /* ADMIN */
    if (cmd === 'admingive') {
      if (!message.member.permissions.has('Administrator')) return message.reply({ embeds: [embedUI('Admin', 'Admin only.', 'neutral')] });
      const mention = message.mentions.users.first();
      const amount = parseAmount(args[1], 0);
      if (!mention || !amount) return message.reply({ embeds: [embedUI('Admin Give — Usage', '`!admingive @user <amount>`', 'neutral')] });
      const target = await fetchUser(mention.id);
      target.wallet += amount;
      await target.save();
      return message.reply({ embeds: [embedUI('Admin Give', `Gave ${formatCurrency(amount)} to <@${mention.id}>.`, 'win')] });
    }
    if (cmd === 'adminremove') {
      if (!message.member.permissions.has('Administrator')) return message.reply({ embeds: [embedUI('Admin', 'Admin only.', 'neutral')] });
      const mention = message.mentions.users.first();
      const amount = parseAmount(args[1], 0);
      if (!mention || !amount) return message.reply({ embeds: [embedUI('Admin Remove — Usage', '`!adminremove @user <amount>`', 'neutral')] });
      const target = await fetchUser(mention.id);
      target.wallet = Math.max(0, target.wallet - amount);
      await target.save();
      return message.reply({ embeds: [embedUI('Admin Remove', `Removed ${formatCurrency(amount)} from <@${mention.id}>.`, 'lose')] });
    }
    if (cmd === 'adminreset') {
      if (!message.member.permissions.has('Administrator')) return message.reply({ embeds: [embedUI('Admin', 'Admin only.', 'neutral')] });
      await User.updateMany({}, { $set: { wallet: 0, bank: 0, wagered: 0 } });
      return message.reply({ embeds: [embedUI('Admin Reset', 'Economy reset for all users.', 'lose')] });
    }

    // ----------------- SHOP & PROFILE -----------------
    if (cmd === 'shop') {
      // Show shop embed with items and buttons
      const userPick = user.pickaxe || { level: 1 };
      const currentPick = PICKAXE_LEVELS.find(p=>p.level===userPick.level) || PICKAXE_LEVELS[0];
      const nextPick = PICKAXE_LEVELS.find(p=>p.level===currentPick.level+1);

      let desc = `**Pickaxe**\n${currentPick.name} — Level ${currentPick.level} — Bonus: +${currentPick.bonus} ore\n\n`;
      desc += `**Lucky Charm**\nSmall item that increases chance for lucky finds (stackable). Cost: ${formatCurrency(500)} each.\n\n`;
      if (nextPick) desc += `Next pickaxe upgrade: ${nextPick.name} — Cost: ${formatCurrency(nextPick.cost)}\n`;
      else desc += `Pickaxe is maxed.`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('shop_buy_pickaxe').setLabel(nextPick ? `Upgrade Pickaxe (${formatCurrency(nextPick.cost)})` : 'Pickaxe Maxed').setStyle(ButtonStyle.Success).setDisabled(!nextPick || user.wallet < (nextPick ? nextPick.cost : Infinity)),
        new ButtonBuilder().setCustomId('shop_buy_luck').setLabel(`Buy Lucky Charm (${formatCurrency(500)})`).setStyle(ButtonStyle.Primary)
      );

      return message.reply({ embeds: [embedUI('Shop', desc, 'neutral')], components: [row] });
    }

    if (cmd === 'profile') {
      const pick = user.pickaxe || { level: 1 };
      const pickObj = PICKAXE_LEVELS.find(p=>p.level===pick.level) || PICKAXE_LEVELS[0];
      const e = embedUI('Profile', '\u200B', 'neutral')
        .addFields(
          { name: 'Wallet', value: `${formatCurrency(user.wallet)}`, inline: true },
          { name: 'Pickaxe', value: `${pickObj.name} (Lvl ${pickObj.level}) — +${pickObj.bonus} ore`, inline: true },
          { name: 'Lucky Charms', value: `${user.luckCharms || 0}`, inline: true },
          { name: 'Mine Streak', value: `${user.mineStreak || 0}`, inline: true },
          { name: 'Messages Sent', value: `${user.messageCount || 0}`, inline: true }
        );
      return message.reply({ embeds: [e] });
    }

    // ----------------- MINING: !mine -----------------
    if (cmd === 'mine') {
      const cd = 2 * 60 * 1000;
      const left = cooldownLeft(user.lastMine, cd);
      if (left) return message.reply({ embeds: [embedUI('Mining Cooldown', `⏳ ${left} left`, 'neutral')] });

      const miningMsg = await message.reply({ embeds: [embedUI('Mining', '⛏️ Starting to mine... (hold tight, just a sec!)', 'cool')] });

      await miningMsg.edit({ embeds: [embedUI('Mining', '⛏️ Swinging pickaxe... (1/3)', 'cool')] });
      await new Promise(r => setTimeout(r, 700));
      await miningMsg.edit({ embeds: [embedUI('Mining', '⛏️ Deeper... (2/3)', 'cool')] });
      await new Promise(r => setTimeout(r, 900));
      await miningMsg.edit({ embeds: [embedUI('Mining', '⛏️ Inspecting veins... (3/3)', 'cool')] });
      await new Promise(r => setTimeout(r, 800));

      // determine loot base
      const found = weightedPick();
      let qty = Math.floor(Math.random() * (found.max - found.min + 1)) + found.min;

      // STREAK LOGIC (compute candidate new streak)
      let newStreak = 1;
      if (user.lastMine && (Date.now() - user.lastMine) <= STREAK_WINDOW_MS) {
        newStreak = (user.mineStreak || 0) + 1;
      } else {
        newStreak = 1;
      }

      // 50% chance to lose your streak on each mine
      let lostStreakThisMine = false;
      if (Math.random() < 0.5) {
        // lose streak
        user.mineStreak = 0;
        lostStreakThisMine = true;
      } else {
        user.mineStreak = newStreak;
      }

      // modest streak bonus: +1 extra ore for each 3-streak (i.e., floor(streak/3))
      const streakBonus = Math.floor((user.mineStreak || 0) / 3);
      if (streakBonus > 0) qty += streakBonus;

      // PICKAXE BONUS
      const pickLevel = (user.pickaxe && user.pickaxe.level) ? user.pickaxe.level : 1;
      const pickObj = PICKAXE_LEVELS.find(p => p.level === pickLevel) || PICKAXE_LEVELS[0];
      qty += pickObj.bonus; // small flat bonus

      // LUCK CHARMS effect: each charm gives +5% chance to be in "lucky find" band, capped modestly
      const charmCount = user.luckCharms || 0;
      const luckExtra = Math.min(0.15, 0.05 * charmCount); // cap at +15%

      // SMALL RANDOM EVENTS (we incorporate luckExtra into lucky-find band)
      let eventText = null;

      // trip (15% chance) — loses $10-15
      if (Math.random() < 0.15) {
        const tripLoss = Math.floor(Math.random() * 6) + 10; // 10-15
        user.wallet = Math.max(0, user.wallet - tripLoss);
        eventText = `🤕 You tripped while mining and lost ${formatCurrency(tripLoss)}.`;
      }

      // separate random roll for other events (so trip and other events can both happen)
      const s = Math.random();

      // rare gem: 1% -> small cash
      if (s < 0.01) {
        const gemCash = 100; // small premium
        user.wallet += gemCash;
        eventText = (eventText ? eventText + '\n' : '') + `💎 Rare gem! You found a gem and got ${formatCurrency(gemCash)}.`;
      }
      // lucky find: next 4% plus luckExtra -> extra 1-2 ore
      else if (s < 0.05 + luckExtra) {
        const extra = Math.floor(Math.random()*2) + 1; // 1-2
        qty += extra;
        eventText = (eventText ? eventText + '\n' : '') + `✨ Lucky find! You mined ${extra} extra ${found.key}.`;
      }
      // coin find: next 10% (5%..15%) -> small cash
      else if (s < 0.15) {
        const coin = Math.floor(Math.random()*31) + 20; // 20-50
        user.wallet += coin;
        eventText = (eventText ? eventText + '\n' : '') + `💰 You found loose coins: ${formatCurrency(coin)}.`;
      }
      // trap: next 4% (15%..19%) -> small loss
      else if (s < 0.19) {
        const loss = Math.floor(Math.random()*21) + 5; // 5-25
        user.wallet = Math.max(0, user.wallet - loss);
        eventText = (eventText ? eventText + '\n' : '') + `⚠️ You triggered a small cave collapse and lost ${formatCurrency(loss)}.`;
      }
      // else no extra event (most cases)

      // apply inventory update and set lastMine
      user.inventory = user.inventory || { stone:0, copper:0, silver:0, gold:0 };
      user.inventory[found.key] = (user.inventory[found.key] || 0) + qty;
      user.lastMine = Date.now();
      await user.save();

      // create result embed (includes streak + any event)
      let desc = `You mined **${qty}x ${found.emoji} ${found.key.toUpperCase()}**!\nValue (per): ${formatCurrency(found.value)} — sell with \`${PREFIX}sell ${found.key} <amount|all>\` or press the buttons below.\n\n**Streak:** ${user.mineStreak} ${user.mineStreak===1?'(start)':'(keep mining to up your bonus)'}`;
      if (streakBonus > 0) desc += `\n**Streak bonus:** +${streakBonus} ore applied.`;
      desc += `\n**Pickaxe:** ${pickObj.name} (Bonus +${pickObj.bonus})`;
      if (lostStreakThisMine) desc += `\n\n❗ You lost your streak this run (50% chance).`;
      if (eventText) desc += `\n\n${eventText}`;

      const e = embedUI('Mining Result', desc, 'win')
        .addFields(
          { name: 'New Wallet', value: `${formatCurrency(user.wallet)}`, inline: true },
          { name: 'Inventory', value: `🪨 ${user.inventory.stone} • 🟠 ${user.inventory.copper} • ⚪ ${user.inventory.silver} • 🟡 ${user.inventory.gold}`, inline: false }
        );

      const row = buildMineRow();
      return miningMsg.edit({ embeds: [e], components: [row] });
    }

    /* ----------------- INVENTORY: !inv ----------------- */
    if (['inv','inventory'].includes(cmd)) {
      user.inventory = user.inventory || { stone:0, copper:0, silver:0, gold:0 };
      const e = embedUI('Inventory', '\u200B', 'neutral')
        .addFields(
          { name: 'Ores', value: `🪨 Stone: **${user.inventory.stone}**\n🟠 Copper: **${user.inventory.copper}**\n⚪ Silver: **${user.inventory.silver}**\n🟡 Gold: **${user.inventory.gold}**`, inline: true },
          { name: 'Sell Prices', value: `Stone: ${formatCurrency(ORE_DEFINITIONS.find(o=>o.key==='stone').value)}\nCopper: ${formatCurrency(ORE_DEFINITIONS.find(o=>o.key==='copper').value)}\nSilver: ${formatCurrency(ORE_DEFINITIONS.find(o=>o.key==='silver').value)}\nGold: ${formatCurrency(ORE_DEFINITIONS.find(o=>o.key==='gold').value)}`, inline: true }
        );
      const row = buildMineRow();
      return message.reply({ embeds: [e], components: [row] });
    }

    /* ----------------- SELL: !sell ----------------- */
    if (cmd === 'sell') {
      // Usage: !sell <stone|copper|silver|gold|all> <amount|all>
      if (!args[0]) return message.reply({ embeds: [embedUI('Sell — Usage', '`!sell <stone|copper|silver|gold|all> <amount|all>`', 'neutral')] });

      user.inventory = user.inventory || { stone:0, copper:0, silver:0, gold:0 };

      const target = args[0].toLowerCase();
      const prices = Object.fromEntries(ORE_DEFINITIONS.map(o=>[o.key,o.value]));

      // sell everything
      if (target === 'all') {
        let total = 0;
        for (const o of ORE_DEFINITIONS) {
          const count = user.inventory[o.key] || 0;
          if (count > 0) {
            total += count * o.value;
            user.inventory[o.key] = 0;
          }
        }
        if (total <= 0) return message.reply({ embeds: [embedUI('Sell', 'You have nothing to sell.', 'neutral')] });
        user.wallet += total;
        await user.save();
        return message.reply({ embeds: [embedUI('Sold All', `You sold everything for **${formatCurrency(total)}**.`, 'win')] });
      }

      // sell a single ore type
      if (!['stone','copper','silver','gold'].includes(target)) return message.reply({ embeds: [embedUI('Sell — Usage', '`!sell <stone|copper|silver|gold|all> <amount|all>`', 'neutral')] });
      const maxHave = user.inventory[target] || 0;
      if (maxHave <= 0) return message.reply({ embeds: [embedUI('Sell', `You have no ${target}.`, 'neutral')] });

      const amountArg = args[1] || '1';
      let amtToSell = null;
      if (amountArg.toLowerCase() === 'all') amtToSell = maxHave;
      else {
        amtToSell = parseAmount(amountArg, maxHave);
      }
      if (!amtToSell || amtToSell <= 0) return message.reply({ embeds: [embedUI('Sell', 'Enter a valid amount to sell (or `all`).', 'neutral')] });
      if (amtToSell > maxHave) return message.reply({ embeds: [embedUI('Sell', `You only have ${maxHave} ${target}.`, 'neutral')] });

      const earned = amtToSell * prices[target];
      user.inventory[target] -= amtToSell;
      user.wallet += earned;
      await user.save();

      return message.reply({ embeds: [embedUI('Sold', `You sold **${amtToSell}x ${target}** for **${formatCurrency(earned)}**.`, 'win')] });
    }

    /* ----------------- BATTLESHIPS CHALLENGE -----------------
       Usage: !battleship @user [bet]
       After accept, both players must use:
         - !place A1 B2 C3   (3 unique coords from A1..E5)
       Then take turns:
         - !fire A1
       Grid is 5x5, each ship occupies one cell. Simplified for chat.
    */
    if (cmd === 'battleship' || cmd === 'bship') {
      const mention = message.mentions.users.first();
      if (!mention) return message.reply({ embeds: [embedUI('Battleship — Usage', '`!battleship @user [bet]`', 'neutral')] });
      if (mention.id === message.author.id) return message.reply("You can't challenge yourself.");

      // parse optional bet
      let bet = 0;
      // find any arg that looks like an amount
      for (const a of args) {
        if (!a.includes(mention.id)) {
          const maybe = parseAmount(a, user.wallet);
          if (maybe) { bet = maybe; break; }
        }
      }
      if (bet > user.wallet) return message.reply({ embeds: [embedUI('Battleship', "You don't have enough for that bet.", 'neutral')] });

      const gameId = `${message.author.id}_${mention.id}_${Date.now()}`;
      bshipGames.set(gameId, { challengerId: message.author.id, opponentId: mention.id, bet: bet || 0, placed: {}, hits: { }, turn: null, status: 'pending' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bship_accept_${gameId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`bship_decline_${gameId}`).setLabel('Decline').setStyle(ButtonStyle.Danger)
      );

      return message.reply({ embeds: [embedUI('Battleship Challenge', `<@${mention.id}>, <@${message.author.id}> challenged you to Battleship${bet?` for ${formatCurrency(bet)}`:''}. Accept?`, 'neutral')], components: [row] });
    }

    // place command for battleship placements
    if (cmd === 'place') {
      // args: coords like A1 B2 C3
      const coords = args.map(a => a.toUpperCase());
      if (!coords.length) return message.reply({ embeds: [embedUI('Place — Usage', '`!place A1 B2 C3` (3 coords)', 'neutral')] });

      // find a battleship game where this user is a player and status is 'pending' or 'placing'
      let game = null; let gameId = null;
      for (const [gid, g] of bshipGames.entries()) {
        if ((g.challengerId === message.author.id || g.opponentId === message.author.id) && (g.status === 'placing' || g.status === 'pending')) { game = g; gameId = gid; break; }
      }
      if (!game) return message.reply({ embeds: [embedUI('Place', 'You are not in a Battleship game that needs placement.', 'neutral')] });

      // validate coords
      // Accept A1..E5
      const valid = coords.every(c => /^[A-E][1-5]$/.test(c));
      if (!valid) return message.reply({ embeds: [embedUI('Place', 'Coords must be in A1..E5 format. Example: `!place A1 B3 C5`', 'neutral')] });

      // require exactly 3 unique coords
      const unique = [...new Set(coords)];
      if (unique.length !== 3) return message.reply({ embeds: [embedUI('Place', 'You must place exactly 3 unique coordinates (3 ships).', 'neutral')] });

      // store
      game.placed = game.placed || {};
      if (game.placed[message.author.id]) return message.reply({ embeds: [embedUI('Place', 'You already placed your ships.', 'neutral')] });

      game.placed[message.author.id] = unique;
      bshipGames.set(gameId, game);

      // inform players
      await message.reply({ embeds: [embedUI('Place', `You placed ships at: ${unique.join(', ')}.`, 'win')] });

      // if both have placed, move to playing
      const p1 = game.placed[game.challengerId];
      const p2 = game.placed[game.opponentId];
      if (p1 && p2) {
        game.status = 'playing';
        game.turn = game.challengerId; // challenger starts
        game.hits = { [game.challengerId]: [], [game.opponentId]: [] };
        bshipGames.set(gameId, game);

        const challengerUser = await client.users.fetch(game.challengerId).catch(()=>null);
        const opponentUser = await client.users.fetch(game.opponentId).catch(()=>null);
        const chanMsg = `<@${game.challengerId}> and <@${game.opponentId}> — both players placed ships. ${challengerUser ? `<@${game.challengerId}>` : 'Challenger'} starts. Use \`${PREFIX}fire <coord>\` to attack (e.g. \`${PREFIX}fire B2\`).`;
        // announce in channel (if both still in same guild presumably)
        try {
          await message.channel.send({ embeds: [embedUI('Battleship', chanMsg, 'neutral')] });
        } catch {}
      }

      return;
    }

    // fire command for battleship
    if (cmd === 'fire') {
      const coord = (args[0] || '').toUpperCase();
      if (!/^[A-E][1-5]$/.test(coord)) return message.reply({ embeds: [embedUI('Fire — Usage', '`!fire A1` (A1..E5)', 'neutral')] });

      // find active game where user is a player and status is 'playing'
      let game = null; let gid = null;
      for (const [gameId, g] of bshipGames.entries()) {
        if ((g.challengerId === message.author.id || g.opponentId === message.author.id) && g.status === 'playing') { game = g; gid = gameId; break; }
      }
      if (!game) return message.reply({ embeds: [embedUI('Fire', 'You are not in an active Battleship game.', 'neutral')] });

      if (game.turn !== message.author.id) return message.reply({ embeds: [embedUI('Fire', "It's not your turn.", 'neutral')] });

      const opponentId = (game.challengerId === message.author.id) ? game.opponentId : game.challengerId;
      game.shots = game.shots || { [game.challengerId]: [], [game.opponentId]: [] };

      // prevent repeated shot at same coord by this player
      if (game.shots[message.author.id].includes(coord)) return message.reply({ embeds: [embedUI('Fire', 'You already fired at that coordinate.', 'neutral')] });

      game.shots[message.author.id].push(coord);

      const opponentShips = game.placed[opponentId];
      let isHit = opponentShips.includes(coord);

      let replyText = isHit ? `🔥 Hit! You hit a ship at ${coord}.` : `🌊 Miss at ${coord}.`;

      if (isHit) {
        game.hits[message.author.id] = game.hits[message.author.id] || [];
        game.hits[message.author.id].push(coord);
        // remove ship from opponent's list (so we can check win)
        game.placed[opponentId] = game.placed[opponentId].filter(c => c !== coord);
      }

      // check win condition
      let gameOver = false;
      if (!game.placed[opponentId] || game.placed[opponentId].length === 0) {
        gameOver = true;
      }

      // switch turn if not game over and if miss, otherwise keep turn on hit (common rules vary; we'll make it alternate regardless)
      if (!gameOver) {
        game.turn = opponentId;
      }

      bshipGames.set(gid, game);

      // award bet if game over
      if (gameOver) {
        game.status = 'finished';
        bshipGames.set(gid, game);

        const winnerId = message.author.id;
        const loserId = opponentId;
        const winnerRec = await fetchUser(winnerId);
        const loserRec = await fetchUser(loserId);

        if (game.bet && game.bet > 0) {
          // verify loser still has required funds? For simplicity, winner gains bet from loser's wallet if they have it, else partial
          const transfer = Math.min(game.bet, loserRec.wallet);
          loserRec.wallet = Math.max(0, loserRec.wallet - transfer);
          winnerRec.wallet += transfer;
          await loserRec.save();
          await winnerRec.save();
        }

        // announce
        try {
          await message.channel.send({ embeds: [embedUI('Battleship — Game Over', `<@${winnerId}> won the game! ${game.bet?`They won ${formatCurrency(game.bet)} (transferred from loser where possible).` : ''}`, 'win')] });
        } catch {}
        return message.reply({ embeds: [embedUI('Fire', `${replyText}\n\n🎉 You sunk the last ship — you WIN!`, 'win')] });
      }

      // not over
      return message.reply({ embeds: [embedUI('Fire', replyText + `\n\nIt's now <@${game.turn}>'s turn.`, isHit ? 'win' : 'neutral')] });
    }

    /* LEAVE A HELP FALLBACK (unknown) */
    const known = ['bal','balance','b','work','daily','cf','coinflip','slots','roulette','rps','lb','leaderboard','admingive','adminremove','adminreset','blackjack','bj','give','g','mine','inv','inventory','sell','shop','profile','hug','kiss','slap','hit','marry','divorce','partner','bite','roll','battleship','bship','place','fire'];
    if (!known.includes(cmd)) {
      return message.reply({ embeds: [embedUI('Help', `Available: ${known.join(', ')}\nExamples:\n\`${PREFIX}cf 500 h\`  \n\`${PREFIX}blackjack 200\` \n\`${PREFIX}mine\` \n\`${PREFIX}sell all\``, 'neutral')] });
    }
  } catch (err) {
    console.error('Command error', err);
    try { message.reply({ embeds: [embedUI('Error', 'An error occurred while processing that command.', 'neutral')] }); } catch {}
  }
});

/* ---------------- INTERACTION (BUTTON) HANDLER ---------------- */

client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.isButton()) return;
    const cid = interaction.customId;

    /* ---------------- MARRIAGE BUTTONS ---------------- */
    if (cid.startsWith("marry_accept_") || cid.startsWith("marry_decline_")) {
      // customId structure: marry_accept_<proposerId>  or marry_decline_<proposerId>
      const parts = cid.split("_");
      const action = parts[1]; // accept / decline
      const proposerId = parts.slice(2).join("_"); // in case IDs had underscores (they don't, but safe)
      const accepterId = interaction.user.id;

      // ensure only the recipient (accepter) can press in their DM
      // (the proposer shouldn't be able to accept from their own accept button)
      if (proposerId === accepterId) {
        return interaction.reply({ content: "You can't accept your own proposal.", ephemeral: true });
      }

      const proposer = await fetchUser(proposerId);
      const accepter = await fetchUser(accepterId);

      if (action === "decline") {
        return interaction.update({
          content: "Proposal declined.",
          components: []
        });
      }

      // accept flow
      if (action === "accept") {
        // check if either is already married
        if (proposer.partnerId || accepter.partnerId) {
          return interaction.update({
            content: "Either you or the proposer is already married to someone else.",
            components: []
          });
        }

        proposer.partnerId = accepter.userId;
        accepter.partnerId = proposer.userId;
        const now = Date.now();
        proposer.marriedAt = now;
        accepter.marriedAt = now;

        await proposer.save();
        await accepter.save();

        // update the DM message
        await interaction.update({
          content: `💖 You accepted the proposal! You're now married to <@${proposer.userId}>.`,
          components: []
        });

        // attempt to notify proposer (if bot can DM them)
        try {
          const discordUser = await client.users.fetch(proposerId).catch(()=>null);
          if (discordUser) {
            await discordUser.send({ content: `💍 <@${accepter.userId}> accepted your proposal! You're now married.` }).catch(()=>null);
          }
        } catch(e){ /* ignore DM errors */ }

        return;
      }
    }

    // ----------------- Blackjack buttons (existing) -----------------
    if (cid.startsWith('bj_')) {
      const game = blackjackGames.get(interaction.user.id);
      if (!game) return interaction.reply({content:'No active game.',ephemeral:true});
      if (interaction.user.id !== game.owner) return interaction.reply({content:'Not your game.',ephemeral:true});

      const userRec = await fetchUser(interaction.user.id);
      const { player, dealer } = game;

      // Helper to send the updated embed (mid-game)
      const updateGameMessage = async (replyImmediate = false) => {
        const embed = new EmbedBuilder()
          .setColor('#ff7ab6')
          .setTitle('🃏 Blackjack')
          .setDescription(`**Bet:** ${formatCurrency(game.bet)}\n\n`+
            `**Your Hand**\n${player.map(c=>c.label).join(' ')} (${handTotal(player)})\n\n`+
            `**Dealer**\n${dealer[0].label} ❓`);
        const row = buildBjRow(player.length, false);
        await interaction.update({ embeds: [embed], components: [row] });
      };

      // HIT
      if (cid === 'bj_hit') {
        player.push(drawCard());
        const total = handTotal(player);

        if (total > 21) {
          blackjackGames.delete(interaction.user.id);
          return interaction.update({
            embeds:[new EmbedBuilder()
              .setColor('#ED4245')
              .setTitle('💥 Bust')
              .setDescription(
                `Your hand:\n${player.map(c=>c.label).join(' ')} (${total})\n\n` +
                `You lost **${formatCurrency(game.bet)}**`
              )],
            components:[]
          });
        }

        return updateGameMessage(true);
      }

      // DOUBLE
      if (cid === 'bj_double') {
        if (player.length !== 2) return interaction.reply({ content:'You can only double on your first move (with 2 cards).', ephemeral:true });
        if (userRec.wallet < game.bet) return interaction.reply({content:'Not enough to double.',ephemeral:true});

        userRec.wallet -= game.bet;
        game.bet *= 2;
        await userRec.save();

        player.push(drawCard());
        const playerTotal = handTotal(player);
        if (playerTotal > 21) {
          blackjackGames.delete(interaction.user.id);
          return interaction.update({
            embeds:[new EmbedBuilder()
              .setColor('#ED4245')
              .setTitle('💥 Bust (Double)')
              .setDescription(
                `Your hand:\n${player.map(c=>c.label).join(' ')} (${playerTotal})\n\n` +
                `You lost **${formatCurrency(game.bet)}**`
              )],
            components:[]
          });
        }
        // fall-through to stand resolution
      }

      // STAND (or resolution after double)
      if (cid === 'bj_stand' || cid === 'bj_double') {
        while (handTotal(dealer) < 17) dealer.push(drawCard());

        const p = handTotal(player);
        const d = handTotal(dealer);

        let result = 'Tie';
        let color = '#FFFFFF';

        if (d > 21 || p > d) {
          userRec.wallet += game.bet * 2;
          result = 'WIN';
          color = '#57F287';
        } else if (p < d) {
          result = 'LOSE';
          color = '#ED4245';
        } else {
          userRec.wallet += game.bet;
          result = 'Tie';
          color = '#FFFFFF';
        }

        await userRec.save();
        blackjackGames.delete(interaction.user.id);

        return interaction.update({
          embeds:[new EmbedBuilder()
            .setColor(color)
            .setTitle(`🃏 ${result}`)
            .setDescription(
              `**Your Hand**\n${player.map(c=>c.label).join(' ')} (${p})\n\n` +
              `**Dealer**\n${dealer.map(c=>c.label).join(' ')} (${d})`
            )],
          components:[]
        });
      }

      return interaction.reply({ content: 'Unknown blackjack action.', ephemeral: true });
    }

    // ----------------- RPS challenge buttons / plays -----------------
    if (cid.startsWith('rps_accept_') || cid.startsWith('rps_decline_') || cid.startsWith('rps_play_')) {
      // accept/decline buttons
      if (cid.startsWith('rps_accept_')) {
        const gameId = cid.split('rps_accept_')[1];
        const game = rpsGames.get(gameId);
        if (!game) return interaction.reply({ content: 'This challenge is not valid or expired.', ephemeral: true });
        if (interaction.user.id !== game.opponentId) return interaction.reply({ content: 'Only the challenged user can accept.', ephemeral: true });

        // create play message with 3 buttons (both players use same buttons)
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`rps_play_${gameId}_rock`).setLabel('Rock').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`rps_play_${gameId}_paper`).setLabel('Paper').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`rps_play_${gameId}_scissors`).setLabel('Scissors').setStyle(ButtonStyle.Primary)
        );

        const playEmbed = embedUI('RPS — Play', `<@${game.challengerId}> vs <@${game.opponentId}> — Both players, click a button to make your choice.`, 'neutral');
        const msg = await interaction.update({ embeds: [playEmbed], components: [row] }).catch(async e => {
          // fallback: reply
          await interaction.reply({ embeds: [playEmbed], components: [row] });
        });

        // store messageId if possible
        game.messageId = msg && msg.id ? msg.id : null;
        rpsGames.set(gameId, game);
        return;
      }

      if (cid.startsWith('rps_decline_')) {
        const gameId = cid.split('rps_decline_')[1];
        const game = rpsGames.get(gameId);
        if (!game) return interaction.reply({ content: 'This challenge is not valid or expired.', ephemeral: true });
        if (interaction.user.id !== game.opponentId) return interaction.reply({ content: 'Only the challenged user can decline.', ephemeral: true });

        rpsGames.delete(gameId);
        return interaction.update({ content: 'Challenge declined.', components: [] });
      }

      // handle rps_play_<gameId>_<choice>
      if (cid.startsWith('rps_play_')) {
        const parts = cid.split('_');
        // structure: [rps, play, <gameIdParts...>, <choice>]  — we created id with no underscores but safe split logic:
        const gameId = parts[2] + (parts.length > 4 ? ('_' + parts.slice(3, parts.length-1).join('_')) : (parts.length === 4 ? '' : ''));
        // above is brittle; simpler: reassemble from the string
        const segments = cid.replace('rps_play_', '').split('_');
        const choice = segments.pop(); // last item is choice
        const gameIdFinal = segments.join('_');

        const game = rpsGames.get(gameIdFinal);
        if (!game) return interaction.reply({ content: 'This game is not valid or expired.', ephemeral: true });

        // only challenger or opponent can press
        if (![game.challengerId, game.opponentId].includes(interaction.user.id)) return interaction.reply({ content: 'You are not part of this game.', ephemeral: true });

        // ensure they haven't already chosen
        const playerKey = (interaction.user.id === game.challengerId) ? 'challenger' : 'opponent';
        if (game.choices[playerKey]) return interaction.reply({ content: 'You already made your choice.', ephemeral: true });

        // record
        game.choices[playerKey] = choice;
        rpsGames.set(gameIdFinal, game);

        // acknowledge to the clicker
        await interaction.reply({ content: `You selected **${choice.toUpperCase()}**.`, ephemeral: true });

        // if both have chosen, resolve
        if (game.choices.challenger && game.choices.opponent) {
          const c1 = game.choices.challenger;
          const c2 = game.choices.opponent;
          const winMatrix = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

          let resultText = `\n\n<@${game.challengerId}> chose **${c1.toUpperCase()}**.\n<@${game.opponentId}> chose **${c2.toUpperCase()}**.\n`;
          let outcome = 'tie';
          if (c1 === c2) outcome = 'tie';
          else if (winMatrix[c1] === c2) outcome = 'challenger';
          else outcome = 'opponent';

          // payout if bet
          if (game.bet && game.bet > 0) {
            const p1 = await fetchUser(game.challengerId);
            const p2 = await fetchUser(game.opponentId);
            p1.wagered += game.bet;
            p2.wagered += game.bet;

            if (outcome === 'challenger') {
              // challenger wins bet from opponent (simple transfer)
              const transfer = Math.min(game.bet, p2.wallet);
              p2.wallet = Math.max(0, p2.wallet - transfer);
              p1.wallet += transfer;
              await p1.save();
              await p2.save();
              resultText += `\n<@${game.challengerId}> wins ${formatCurrency(transfer)}!`;
            } else if (outcome === 'opponent') {
              const transfer = Math.min(game.bet, p1.wallet);
              p1.wallet = Math.max(0, p1.wallet - transfer);
              p2.wallet += transfer;
              await p1.save();
              await p2.save();
              resultText += `\n<@${game.opponentId}> wins ${formatCurrency(transfer)}!`;
            } else {
              resultText += `\nIt's a tie — no funds exchanged.`;
            }
          } else {
            if (outcome === 'challenger') resultText += `\n<@${game.challengerId}> wins!`;
            else if (outcome === 'opponent') resultText += `\n<@${game.opponentId}> wins!`;
            else resultText += `\nIt's a tie!`;
          }

          // disable buttons on the original play message if we have it
          try {
            if (game.messageId) {
              // attempt to fetch and edit original message in the channel (best-effort)
              const channel = interaction.channel;
              const originalMessage = await channel.messages.fetch(game.messageId).catch(()=>null);
              if (originalMessage) {
                const disabledRow = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId('rps_disabled_rock').setLabel('Rock').setStyle(ButtonStyle.Secondary).setDisabled(true),
                  new ButtonBuilder().setCustomId('rps_disabled_paper').setLabel('Paper').setStyle(ButtonStyle.Secondary).setDisabled(true),
                  new ButtonBuilder().setCustomId('rps_disabled_scissors').setLabel('Scissors').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                await originalMessage.edit({ embeds: [embedUI('RPS — Result', resultText, 'neutral')], components: [disabledRow] }).catch(()=>null);
              } else {
                await interaction.channel.send({ embeds: [embedUI('RPS — Result', resultText, 'neutral')] }).catch(()=>null);
              }
            } else {
              await interaction.channel.send({ embeds: [embedUI('RPS — Result', resultText, 'neutral')] }).catch(()=>null);
            }
          } catch (e) {
            // fallback: just send result to channel
            await interaction.channel.send({ embeds: [embedUI('RPS — Result', resultText, 'neutral')] }).catch(()=>null);
          }

          // cleanup
          rpsGames.delete(gameIdFinal);
        }

        return;
      }
    }

    // ----------------- Mining buttons -----------------
    if (cid.startsWith('mine_') || cid === 'shop_open') {
      // SHOP opener from mine row
      if (cid === 'shop_open') {
        const userRec = await fetchUser(interaction.user.id);
        const currentPick = PICKAXE_LEVELS.find(p=>p.level===userRec.pickaxe.level) || PICKAXE_LEVELS[0];
        const nextPick = PICKAXE_LEVELS.find(p=>p.level===currentPick.level+1);

        let desc = `**Pickaxe**\n${currentPick.name} — Level ${currentPick.level} — Bonus: +${currentPick.bonus} ore\n\n`;
        desc += `**Lucky Charm**\nSmall item that increases chance for lucky finds (stackable). Cost: ${formatCurrency(500)}) each.\n\n`;
        if (nextPick) desc += `Next pickaxe upgrade: ${nextPick.name} — Cost: ${formatCurrency(nextPick.cost)}\n`;
        else desc += `Pickaxe is maxed.`;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('shop_buy_pickaxe').setLabel(nextPick ? `Upgrade Pickaxe (${formatCurrency(nextPick.cost)})` : 'Pickaxe Maxed').setStyle(ButtonStyle.Success).setDisabled(!nextPick || userRec.wallet < (nextPick ? nextPick.cost : Infinity)),
          new ButtonBuilder().setCustomId('shop_buy_luck').setLabel(`Buy Lucky Charm (${formatCurrency(500)})`).setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({ embeds: [embedUI('Shop', desc, 'neutral')], components: [row], ephemeral: true });
      }

      if (cid === 'mine_open_inv') {
        const userRec = await fetchUser(interaction.user.id);
        userRec.inventory = userRec.inventory || { stone:0, copper:0, silver:0, gold:0 };
        const e = embedUI('Inventory', '\u200B', 'neutral')
          .addFields(
            { name: 'Ores', value: `🪨 Stone: **${userRec.inventory.stone}**\n🟠 Copper: **${userRec.inventory.copper}**\n⚪ Silver: **${userRec.inventory.silver}**\n🟡 Gold: **${userRec.inventory.gold}**`, inline: true },
            { name: 'Sell Prices', value: `Stone: ${formatCurrency(ORE_DEFINITIONS.find(o=>o.key==='stone').value)}\nCopper: ${formatCurrency(ORE_DEFINITIONS.find(o=>o.key==='copper').value)}\nSilver: ${formatCurrency(ORE_DEFINITIONS.find(o=>o.key==='silver').value)}\nGold: ${formatCurrency(ORE_DEFINITIONS.find(o=>o.key==='gold').value)}`, inline: true }
          );
        return interaction.reply({ embeds: [e], ephemeral: true });
      }

      if (cid === 'mine_sell_all') {
        const userRec = await fetchUser(interaction.user.id);
        userRec.inventory = userRec.inventory || { stone:0, copper:0, silver:0, gold:0 };

        let total = 0;
        for (const o of ORE_DEFINITIONS) {
          const count = userRec.inventory[o.key] || 0;
          if (count > 0) {
            total += count * o.value;
            userRec.inventory[o.key] = 0;
          }
        }
        if (total <= 0) {
          try { await interaction.update({ content: null, embeds: [embedUI('Sell', 'You have nothing to sell.', 'neutral')], components: [] }); } catch {}
          return;
        }
        userRec.wallet += total;
        await userRec.save();

        const soldEmbed = embedUI('Sold All', `You sold everything for **${formatCurrency(total)}**.`, 'win')
          .addFields({ name: 'New Wallet', value: `${formatCurrency(userRec.wallet)}`, inline:true });
        return interaction.update({ embeds: [soldEmbed], components: [] });
      }

      return interaction.reply({ content:'Unknown mining action.', ephemeral:true });
    }

    // ----------------- Shop buy buttons -----------------
    if (cid === 'shop_buy_pickaxe' || cid === 'shop_buy_luck') {
      const userRec = await fetchUser(interaction.user.id);
      const current = PICKAXE_LEVELS.find(p=>p.level === userRec.pickaxe.level) || PICKAXE_LEVELS[0];
      const next = PICKAXE_LEVELS.find(p=>p.level === current.level + 1);

      if (cid === 'shop_buy_pickaxe') {
        if (!next) return interaction.reply({ content: 'Your pickaxe is already max level.', ephemeral: true });
        if (userRec.wallet < next.cost) return interaction.reply({ content: `You need ${formatCurrency(next.cost)} to buy that.`, ephemeral: true });

        userRec.wallet -= next.cost;
        userRec.pickaxe.level = next.level;
        await userRec.save();

        return interaction.update({ embeds: [embedUI('Upgrade Purchased', `You bought **${next.name}** (Level ${next.level}) — +${next.bonus} ore.`, 'win')], components: [] });
      }

      if (cid === 'shop_buy_luck') {
        const cost = 500;
        if (userRec.wallet < cost) return interaction.reply({ content: `You need ${formatCurrency(cost)} to buy a Lucky Charm.`, ephemeral: true });

        userRec.wallet -= cost;
        userRec.luckCharms = (userRec.luckCharms || 0) + 1;
        await userRec.save();

        return interaction.update({ embeds: [embedUI('Purchased', `You bought a Lucky Charm. You now have ${userRec.luckCharms} charm(s).`, 'win')], components: [] });
      }
    }

    // ----------------- Battleship accept/decline buttons -----------------
    if (cid.startsWith('bship_accept_') || cid.startsWith('bship_decline_')) {
      const gameId = cid.replace('bship_accept_', '').replace('bship_decline_', '');
      const game = bshipGames.get(gameId);
      if (!game) return interaction.reply({ content: 'This battle is not valid or expired.', ephemeral: true });

      if (cid.startsWith('bship_decline_')) {
        if (interaction.user.id !== game.opponentId) return interaction.reply({ content: 'Only the challenged user can decline.', ephemeral: true });
        bshipGames.delete(gameId);
        return interaction.update({ content: 'Battle declined.', components: [] });
      }

      if (cid.startsWith('bship_accept_')) {
        if (interaction.user.id !== game.opponentId) return interaction.reply({ content: 'Only the challenged user can accept.', ephemeral: true });
        // move to placing state
        game.status = 'placing';
        bshipGames.set(gameId, game);

        // notify both players to place ships
        try {
          await interaction.update({ content: `Battle accepted! Both players: place ships using \`${PREFIX}place A1 B2 C3\` (3 distinct coords A1..E5).`, components: [] });
        } catch {
          await interaction.reply({ content: `Battle accepted! Both players: place ships using \`${PREFIX}place A1 B2 C3\` (3 distinct coords A1..E5).`, ephemeral: true });
        }
        return;
      }
    }

    // other customIds: ignore
    return;
  } catch (err) {
    console.error('Interaction error', err);
    try { if (interaction.replied || interaction.deferred) await interaction.followUp({ content: 'An error occurred.', ephemeral: true }); else await interaction.reply({ content: 'An error occurred.', ephemeral: true }); } catch {}
  }
});

/* ---------------- READY ---------------- */

client.once('ready', () => console.log(`${client.user.tag} online`));
client.login(process.env.TOKEN);
