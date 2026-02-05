require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

/* ---------------- DATABASE ---------------- */

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  wallet: { type: Number, default: 1000 },
  bank: { type: Number, default: 0 },
  wagered: { type: Number, default: 0 },
  lastWork: { type: Number, default: 0 },
  lastDaily: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

/* ---------------- CLIENT ---------------- */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
const PREFIX = process.env.PREFIX || '!';

mongoose.connect(process.env.MONGO_URI).then(()=>console.log("MongoDB connected"))
  .catch(err => { console.error('MongoDB error', err); process.exit(1); });

/* ---------------- UI COLORS ---------------- */

function embedUI(title, description = '\u200B', type = 'neutral') {
  // type: 'win'|'lose'|'tie'|'neutral'
  let color = '#ff7ab6';
  if (type === 'win') color = '#57F287';
  if (type === 'lose') color = '#ED4245';
  if (type === 'tie') color = '#FFFFFF';

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

/* ---------------- COMMANDS ---------------- */

client.on('messageCreate', async message => {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (args.shift() || '').toLowerCase();
    const user = await fetchUser(message.author.id);

    /* BALANCE */
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
      if (!args[1]) return message.reply('Usage: !give @user <amount>');
      if (mention.id === authorId) return message.reply("You can't give to yourself.");
      const amount = parseAmount(args[1], user.wallet);
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

    /* RPS */
    if (cmd === 'rps') {
      const choice = (args[0] || '').toLowerCase();
      if (!['rock','paper','scissors'].includes(choice)) return message.reply({ embeds: [embedUI('RPS — Usage', '`!rps <rock|paper|scissors> [bet]`', 'neutral')] });

      let bet = 0;
      if (args[1]) {
        bet = parseAmount(args[1], user.wallet);
        if (!bet) return message.reply({ embeds: [embedUI('RPS', 'Invalid bet.', 'neutral')] });
        if (bet > user.wallet) return message.reply({ embeds: [embedUI('RPS', "You don't have enough.", 'neutral')] });
      }

      const botChoice = ['rock','paper','scissors'][Math.floor(Math.random()*3)];
      const winMatrix = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      let type = 'tie';
      let text = '';

      if (choice === botChoice) {
        type = 'tie';
        text = `It's a tie — we both chose **${botChoice.toUpperCase()}**.`;
      } else if (winMatrix[choice] === botChoice) {
        type = 'win';
        if (bet > 0) { user.wallet += bet; user.wagered += bet; await user.save(); }
        text = `You **WIN** — I chose **${botChoice.toUpperCase()}**. ${bet>0?`You gained **${formatCurrency(bet)}**.`:''}`;
      } else {
        type = 'lose';
        if (bet > 0) { user.wallet -= bet; user.wagered += bet; await user.save(); }
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

    // unknown
    const known = ['bal','balance','b','work','daily','cf','coinflip','slots','roulette','rps','lb','leaderboard','admingive','adminremove','adminreset'];
    if (!known.includes(cmd)) {
      return message.reply({ embeds: [embedUI('Help', `Available: ${known.join(', ')}\nExamples:\n\`${PREFIX}cf 500 h\`  \n\`${PREFIX}blackjack 200\` (if enabled)\n\`${PREFIX}roulette 100 red\``, 'neutral')] });
    }
  } catch (err) {
    console.error('Command error', err);
    try { message.reply({ embeds: [embedUI('Error', 'An error occurred while processing that command.', 'neutral')] }); } catch {}
  }
});

/* ---------------- READY ---------------- */

client.once('ready', () => console.log(`${client.user.tag} online`));
client.login(process.env.TOKEN);
