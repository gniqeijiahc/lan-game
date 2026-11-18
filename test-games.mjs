import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {extname, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomBytes} from 'node:crypto'
import {chromium} from 'playwright'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)))
const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
const roomId = () => Array.from(randomBytes(10), byte => alphabet[byte % alphabet.length]).join('')
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = resolve(root, `.${pathname}`)
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end('Forbidden')
      return
    }
    const content = await readFile(file)
    response.writeHead(200, {'Content-Type': mimeTypes[extname(file)] || 'application/octet-stream'})
    response.end(content)
  } catch {
    response.writeHead(404).end('Not found')
  }
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitConnected(pages) {
  try {
    await Promise.all(pages.map(page => page.waitForFunction(
      () => document.querySelector('[data-el="status"]')?.textContent.includes('已连接'),
      null,
      {timeout: 20000}
    )))
  } catch (error) {
    const diagnostics = await Promise.all(pages.map(async page => ({
      url: page.url(),
      status: await page.locator('[data-el="status"]').innerText().catch(() => '(missing)'),
      detail: await page.locator('[data-el="detail"]').innerText().catch(() => ''),
      errors: page.testErrors
    })))
    throw new Error(`${error.message}\n${JSON.stringify(diagnostics)}`)
  }
}

async function openPair(browser, gamePath) {
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}})
  const room = roomId()
  const base = `http://127.0.0.1:${server.address().port}/${gamePath}`
  const strategy = process.env.SIGNALING
  const query = strategy && strategy !== 'nostr' ? `?s=${encodeURIComponent(strategy)}` : ''
  const host = await context.newPage()
  const peer = await context.newPage()
  for (const page of [host, peer]) {
    page.testErrors = []
    page.on('pageerror', error => page.testErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') page.testErrors.push(message.text())
    })
    page.on('requestfailed', request => page.testErrors.push(`${request.url()}: ${request.failure()?.errorText}`))
  }
  await Promise.all([
    host.goto(`${base}${query}#${room}`),
    peer.goto(`${base}${query}${query ? '&' : '?'}identity=none#${room}`)
  ])
  return {context, host, peer}
}

async function testRps(browser) {
  const pair = await openPair(browser, 'games/rps/index.html')
  try {
    const {host, peer} = pair
    await waitConnected([host, peer])
    await Promise.all([
      host.locator('#choices button[data-c="rock"]').click(),
      peer.locator('#choices button[data-c="scissors"]').click()
    ])
    await Promise.all([
      host.waitForFunction(() => document.querySelector('#result')?.textContent.length > 0),
      peer.waitForFunction(() => document.querySelector('#result')?.textContent.length > 0)
    ])
    assert((await host.locator('#result').innerText()).includes('你赢了'), 'host did not win rock vs scissors')
    assert((await peer.locator('#result').innerText()).includes('你输了'), 'peer did not lose rock vs scissors')
    assert((await host.locator('#sMe').innerText()) === '1', 'host score did not update')
    assert((await peer.locator('#sThem').innerText()) === '1', 'peer score did not update')
  } finally {
    await pair.context.close()
  }
}

async function testConnectFour(browser) {
  const pair = await openPair(browser, 'games/connect-four/index.html')
  try {
    const {host, peer} = pair
    const pages = [host, peer]
    await waitConnected(pages)
    await Promise.all(pages.map(page => page.waitForFunction(
      () => document.querySelector('#who')?.textContent.includes('你是')
    )))
    const active = (await host.locator('#who').innerText()).includes('先手') ? host : peer
    await active.locator('#board button[aria-label="第 4 列"]').click()
    await Promise.all(pages.map(page => page.waitForFunction(
      () => document.querySelectorAll('#board .cell.p0').length === 1
    )))
    const boards = await Promise.all(pages.map(page => page.locator('#board .cell').evaluateAll(
      cells => cells.map(cell => cell.className)
    )))
    assert(JSON.stringify(boards[0]) === JSON.stringify(boards[1]), 'board state differs between players')
  } finally {
    await pair.context.close()
  }
}

async function testDraw(browser) {
  const pair = await openPair(browser, 'games/draw/index.html')
  try {
    const {host, peer} = pair
    const pages = [host, peer]
    await waitConnected(pages)
    await Promise.all(pages.map(page => page.waitForFunction(
      () => document.querySelector('#roleTxt')?.textContent.includes('你来')
    )))
    const painter = (await host.locator('#roleTxt').innerText()).includes('你来画') ? host : peer
    const guesser = painter === host ? peer : host
    await painter.locator('#pick .wbtn').first().click()
    await Promise.all(pages.map(page => page.locator('#cv').waitFor({state: 'visible', timeout: 10000})))
    const answer = await painter.locator('#banner .word').innerText()
    const canvas = await painter.locator('#cv').boundingBox()
    assert(canvas, 'painter canvas is not visible')
    await painter.mouse.move(canvas.x + 60, canvas.y + 60)
    await painter.mouse.down()
    await painter.mouse.move(canvas.x + 250, canvas.y + 60, {steps: 8})
    await painter.mouse.move(canvas.x + 250, canvas.y + 180, {steps: 6})
    await painter.mouse.up()

    const pixelCount = page => page.locator('#cv').evaluate(cv => {
      const pixels = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) count++
      }
      return count
    })
    await guesser.waitForFunction(() => {
      const cv = document.querySelector('#cv')
      if (!cv) return false
      const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return true
      }
      return false
    }, null, {timeout: 10000})
    assert(await pixelCount(painter) > 100, 'painter canvas has no stroke')
    assert(await pixelCount(guesser) > 100, 'drawing did not sync to guesser')

    await guesser.locator('#gin').fill(answer)
    await guesser.locator('#gform').press('Enter')
    await Promise.all(pages.map(page => page.waitForFunction(
      () => document.querySelector('#banner')?.textContent.includes('答对了')
    )))
    assert(Number(await painter.locator('#sMe').innerText()) > 0, 'painter score did not update')
    assert(Number(await guesser.locator('#sMe').innerText()) > 0, 'guesser score did not update')
  } finally {
    await pair.context.close()
  }
}

async function testQuoridor(browser) {
  const pair = await openPair(browser, 'games/quoridor/index.html')
  try {
    const {host, peer} = pair
    const pages = [host, peer]
    await waitConnected(pages)
    await Promise.all(pages.map(page => page.waitForFunction(
      () => ['轮到你了', '等待对方行动'].some(text => document.querySelector('#hint')?.textContent.includes(text))
    )))
    const mover = (await host.locator('#hint').innerText()).includes('轮到你了') ? host : peer
    const waiting = mover === host ? peer : host
    const before = await mover.locator('#board .pawn.me').getAttribute('cy')
    await mover.locator('#board').evaluate(el => el.scrollIntoView({block: 'center'}))
    const board = await mover.locator('#board').boundingBox()
    const legal = await mover.locator('#board .legal').first()
    const x = Number(await legal.getAttribute('x')) + 5
    const y = Number(await legal.getAttribute('y')) + 5
    await mover.mouse.click(board.x + board.width * x / 110, board.y + board.height * y / 110)
    await mover.locator('#ok').evaluate(button => button.click())
    await Promise.all([
      mover.waitForFunction(() => document.querySelector('#hint')?.textContent.includes('等待对方行动')),
      waiting.waitForFunction(() => document.querySelector('#hint')?.textContent.includes('轮到你了'))
    ])
    const after = await mover.locator('#board .pawn.me').getAttribute('cy')
    assert(before !== after, 'local pawn did not move')
    assert(await waiting.locator('#board .w0, #board .w1').count() === 0, 'unexpected wall before wall test')

    await waiting.locator('#mWall').click()
    await waiting.locator('#board').evaluate(el => el.scrollIntoView({block: 'center'}))
    const waitingBoard = await waiting.locator('#board').boundingBox()
    await waiting.mouse.click(
      waitingBoard.x + waitingBoard.width * 61.25 / 110,
      waitingBoard.y + waitingBoard.height * 61.25 / 110
    )
    assert(await waiting.locator('#board .pv.ok').count() === 1, 'center wall placement was not legal')
    await waiting.locator('#ok').evaluate(button => button.click())
    await Promise.all(pages.map(page => page.waitForFunction(
      () => document.querySelectorAll('#board .w0, #board .w1').length === 1
    )))
    const counts = await Promise.all(pages.map(page => page.locator('#board .w0, #board .w1').count()))
    assert(counts[0] === counts[1], 'wall placement did not sync')
  } finally {
    await pair.context.close()
  }
}

const tests = [
  ['剪刀石头布', testRps],
  ['四子棋', testConnectFour],
  ['你画我猜', testDraw],
  ['步步为营', testQuoridor]
]
const results = []
let browser

try {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  browser = await chromium.launch({headless: process.env.HEADED !== '1'})

  for (const [name, run] of tests) {
    try {
      await run(browser)
      results.push({name, passed: true})
      console.log(`通过  ${name}`)
    } catch (error) {
      results.push({name, passed: false})
      console.error(`失败  ${name}: ${error.message}`)
    }
  }
} catch (error) {
  console.error(`测试启动失败: ${error.message}`)
  results.push({name: '启动测试环境', passed: false})
} finally {
  if (browser) await browser.close()
  if (server.listening) await new Promise(resolveClose => server.close(resolveClose))
}

const passed = results.filter(result => result.passed).length
const failed = results.length - passed
console.log(`\n结果：${passed} 通过，${failed} 失败`)
if (failed) process.exitCode = 1
