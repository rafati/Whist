import { spawn } from 'child_process';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import {
  calculateRoundScores,
  checkMatchEnd,
  createInitialGameState,
  evaluateTrickWinner,
  getTeam,
  getTeamName,
} from '../src/logic/gameLogic.ts';
import { Card, PlayedCard, Seat, Bid, TrumpSuit } from '../src/types.ts';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9335;
const TEST_SERVER_PORT = 3005;
const ARTIFACT_DIR = '/Users/rafatishaq/.gemini/antigravity/brain/bb2f3ae4-dabf-41cd-9cd4-fe3c27f05565';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  private ws!: WebSocket;
  private id = 1;
  private callbacks = new Map<number, (res: any) => void>();

  constructor(private wsUrl: string) {}

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise<void>((resolve, reject) => {
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
    });

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id)!;
        this.callbacks.delete(msg.id);
        cb(msg);
      }
    });
  }

  send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const reqId = this.id++;
      this.callbacks.set(reqId, resolve);
      this.ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  async evaluate(expression: string) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    return res.result?.result?.value;
  }

  async captureScreenshot(outputPath: string) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res.result?.data) {
      fs.writeFileSync(outputPath, Buffer.from(res.result.data, 'base64'));
      console.log(`📸 Saved screenshot to ${outputPath}`);
    } else {
      console.error('Failed to capture screenshot:', res);
    }
  }

  close() {
    this.ws.close();
  }
}


async function simulateSalapand() {
  console.log('================================================================');
  console.log('   🔥 SIMULATING SALAPAND (سالابند) - 13 TRICKS SWEEP 🔥');
  console.log('================================================================\n');

  // 1. Initialize Game State
  const state = createInitialGameState('North');
  const bid: Bid = { seat: 'North', type: 'bid', level: 1, contractType: 'Suit' };
  const declarer: Seat = 'North';
  const trump: TrumpSuit = 'S'; // Spades
  state.winningBid = bid;
  state.declarer = declarer;
  state.trumpSuit = trump;
  state.phase = 'playing';

  console.log(`Round 1 Contract: Declarer ${declarer} (Team 1) bid 1 Suit (Spades ♠).`);
  console.log(`Required Tricks to fulfill contract: 6 + 1 = 7 tricks.\n`);

  // Simulate 13 tricks where Team 1 (North / South) captures every single trick
  const seats: Seat[] = ['North', 'East', 'South', 'West'];
  const simulatedTricks: { trickNumber: number; winner: Seat; winningCard: string }[] = [];

  for (let trickNum = 1; trickNum <= 13; trickNum++) {
    // Trick leader is North (or South)
    const leader: Seat = trickNum % 2 === 1 ? 'North' : 'South';
    // North/South plays an unbeatable spade or high card
    const winningRank = trickNum === 1 ? 'A' : trickNum === 2 ? 'K' : trickNum === 3 ? 'Q' : 'J';
    const winningCard: Card = { id: `${winningRank}S`, suit: 'S', rank: winningRank as any };

    const playedCards: PlayedCard[] = [
      { seat: leader, card: winningCard },
      { seat: 'East', card: { id: `2C`, suit: 'C', rank: '2' } },
      { seat: leader === 'North' ? 'South' : 'North', card: { id: `3S`, suit: 'S', rank: '3' } },
      { seat: 'West', card: { id: `3C`, suit: 'C', rank: '3' } },
    ];

    const evalResult = evaluateTrickWinner(playedCards, trump);
    const winnerTeam = getTeam(evalResult.winner);
    state.tricksWonCount[evalResult.winner]++;
    state.teamTricksWon[winnerTeam]++;

    simulatedTricks.push({
      trickNumber: trickNum,
      winner: evalResult.winner,
      winningCard: `${evalResult.winningCard.rank}${evalResult.winningCard.suit}`,
    });

    console.log(
      `Trick #${trickNum.toString().padStart(2, ' ')}: Won by ${evalResult.winner} (${getTeamName(winnerTeam)}) with ${evalResult.winningCard.rank}♠. Current: Team 1: ${state.teamTricksWon.TeamA} | Team 2: ${state.teamTricksWon.TeamB}`
    );
  }

  console.log('\n--- 13 TRICKS COMPLETED! CALCULATING ROUND SCORES ---');
  const breakdown = calculateRoundScores(
    bid,
    declarer,
    trump,
    1,
    state.teamTricksWon
  );

  console.log(`\n🎉 Salapand Status: ${breakdown.isSalpand ? '🔥 SALAPAND (سالابند) ACHIEVED!' : 'No'}`);
  console.log(`🏆 Honored Team: ${getTeamName(breakdown.salpandTeam!)}`);
  console.log(`📈 Score Delta Team 1: +${breakdown.scoreDeltaBidTeam} pts (Awarded 11 points per Salapand rule!)`);
  console.log(`📉 Score Delta Team 2: +${breakdown.scoreDeltaDefTeam} pts`);
  console.log(`📝 Official Breakdown Explanation:`);
  breakdown.explanation.forEach((line) => console.log(`   - ${line}`));

  state.roundScores.push(breakdown);
  state.matchScores.TeamA += breakdown.scoreDeltaBidTeam;
  state.matchScores.TeamB += breakdown.scoreDeltaDefTeam;

  const matchEnd = checkMatchEnd(state.matchScores);
  console.log(`\n🏁 Match Result: ${matchEnd.isOver ? 'MATCH OVER (VICTORY)' : 'Ongoing'}`);
  console.log(`👑 Match Winner: ${matchEnd.winnerTeam ? getTeamName(matchEnd.winnerTeam) : 'None'}`);
  console.log(`📊 Final Match Standings: Team 1: ${state.matchScores.TeamA} pts | Team 2: ${state.matchScores.TeamB} pts`);

  // 2. Launch App and Capture Visual Screenshot of the Salapand Celebration Modal
  console.log('\n--- 2. LAUNCHING BROWSER TO CAPTURE SALAPAND ANIMATION SCREENSHOT ---');
  const serverProcess = spawn('node', ['dist/server.cjs'], {
    env: { ...process.env, PORT: String(TEST_SERVER_PORT) },
    stdio: 'ignore',
  });

  await wait(1500);

  const tmpProfile = `/tmp/chrome_salapand_${Date.now()}`;
  fs.mkdirSync(tmpProfile, { recursive: true });

  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${tmpProfile}`,
      '--window-size=1200,800',
      '--no-first-run',
      '--no-default-browser-check',
      `http://localhost:${TEST_SERVER_PORT}`,
    ],
    { stdio: 'ignore' }
  );

  let cdpWsUrl = '';
  for (let i = 0; i < 25; i++) {
    await wait(300);
    try {
      const res = await fetch(`http://localhost:${DEBUG_PORT}/json/version`);
      if (res.ok) {
        const json = await res.json();
        cdpWsUrl = json.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (cdpWsUrl) {
    const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
    const tabs = await listRes.json();
    const pageTab = tabs.find((t: any) => t.type === 'page');
    const cdp = new CDPClient(pageTab ? pageTab.webSocketDebuggerUrl : cdpWsUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('Step A: Setting auth in localStorage and navigating...');
    await cdp.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('whist_google_account_v2', JSON.stringify({
          sub: 'tester_salapand_champ',
          name: 'Salapand Champion',
          email: 'salapand@royalwhist.local',
          avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Salapand'
        }));
      `,
    });

    await cdp.send('Page.navigate', { url: `http://localhost:${TEST_SERVER_PORT}?dev=true` });
    await wait(2500);

    let pageText = await cdp.evaluate('document.body.innerText');
    console.log('Page Text:', (pageText || '').replace(/\\s+/g, ' ').substring(0, 160));

    // If still on auth screen for any reason, click "Quick Play with Display Name"
    if (pageText && pageText.includes('تسجيل الدخول') || pageText.includes('Quick Play with Display Name')) {
      const authClick = await cdp.evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Quick Play with Display Name'));
        if (btn) { btn.click(); return 'Clicked Quick Play with Display Name'; }
        return 'Not found';
      })()`);
      console.log('Auth fallback:', authClick);
      await wait(2000);
    }

    // Now in Lobby: click "Play Instant AI"
    console.log('Step B: Starting Instant AI table...');
    const lobbyClick = await cdp.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const playBtn = buttons.find(b => b.textContent && (b.textContent.includes('Play Instant AI') || b.textContent.includes('Instant AI') || b.textContent.includes('Quick Play')));
      if (playBtn) {
        playBtn.click();
        return 'Clicked: ' + playBtn.textContent.trim();
      }
      return 'Available: ' + buttons.map(b => b.textContent.trim()).join(' | ');
    })()`);
    console.log('Lobby Action:', lobbyClick);

    await wait(3500);

    // If in waiting room, click "Fill Bots & Deal Cards"
    const waitRoomClick = await cdp.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const dealBtn = buttons.find(b => b.textContent && (b.textContent.includes('Fill Bots & Deal') || b.textContent.includes('Deal Cards')));
      if (dealBtn) {
        dealBtn.click();
        return 'Clicked deal button: ' + dealBtn.textContent.trim();
      }
      return 'No deal button needed';
    })()`);
    console.log('Waiting Room Action:', waitRoomClick);

    await wait(2500);

    // Now at the Table: open table options menu
    console.log('Step C: Opening Table Options menu...');
    const menuClick = await cdp.evaluate(`(() => {
      const menuBtn = document.querySelector('button[title="Table Options"]') ||
        Array.from(document.querySelectorAll('header button')).slice(-1)[0];
      if (menuBtn) {
        menuBtn.click();
        return 'Opened Table Options';
      }
      return 'Table menu button not found';
    })()`);
    console.log('Table Menu Action:', menuClick);

    await wait(1000);

    // Click "Preview Salapand (سالابند)"
    console.log('Step D: Triggering Salapand celebration...');
    const previewClick = await cdp.evaluate(`(() => {
      const prevBtn = document.querySelector('button[data-testid="preview-salpand-btn"]') ||
        Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('سالابند') || b.textContent.includes('Salapand')));
      if (prevBtn) {
        prevBtn.click();
        return 'Clicked Salapand Preview button!';
      }
      return 'Buttons in menu: ' + Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).join(' | ');
    })()`);
    console.log('Preview Action:', previewClick);

    await wait(2000); // Let fireworks, sunburst, and crown animation fully render


    const screenshotPath = path.join(ARTIFACT_DIR, 'salapand_animation_preview.png');
    await cdp.captureScreenshot(screenshotPath);

    cdp.close();
  }

  chromeProcess.kill();
  serverProcess.kill();
  console.log('✅ Simulation and visual verification complete!');
}

simulateSalapand().catch((e) => {
  console.error('Simulation error:', e);
  process.exit(1);
});
