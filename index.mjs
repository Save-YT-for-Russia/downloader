/*
  Выкачивать видео
  
  v1.0.1-020824
    * Обнаружена проблема с выкачиванием определённого видео
    * При проблеме ^ плодил ошибочную ссылку
    
  v1.0.0-020824

  
  TODO: сделать получение с сервера (для не френдзоны)
  
  Проблемы:
    * https://www.youtube.com/watch?v=eNyp-ehZcWE
    stderr ERROR: [youtube] eNyp-ehZcWE: Sign in to confirm you’re not a bot. This helps protect our community. Learn more
    
    FAQ yt-dpl: https://www.reddit.com/user/krimsen/comments/uzpaaq/ytdlp_faq_and_basic_operation_tips_and_tricks/
*/

const ablyKey = 'IBK3WA.bMRjog:UwNFpacs1Pu98g_yXdowJNWLrF2NEAXbZzHKghS8_cw';
const channelName = "get-started"; // имя канала для обмена сообщениями

// init
import Ably from 'ably';
import { spawn } from "child_process"
import EventEmitter from "events";

const messages = [];
const emitter = new EventEmitter();
let isBusy = false;
const getResultfileNameRegex = /file\s+(.+?\.mp4)/;// /.*file (.*\.mp4)/gm
//pub/sub
let ably = new Ably.Realtime(ablyKey)
let channel = ably.channels.get(channelName)

ably.connection.on( async (stateChange) => {
  console.log('==============', stateChange.current)
})
// ably.connection.on(["disconnected", "closed"], async () => {
//   await ably.connection.close()
  
//   ably = new Ably.Realtime(ablyKey)
//   channel = ably.channels.get(channelName)
// })

ably.connection.on((stateChange) => {
  console.log('New connection state is ' + stateChange.current);
});

// main
ably.connection.once("connected", () => {
  console.log("DOWNLOADER: Connected to Ably!")
})

await channel.subscribe("first", (message) => { // first - имя этого исполнителя
  console.log("Message received: " + message.data)
  messages.push(message.data)
  emitter.emit('new_link')
});

emitter.on('upload_data', (id, filename) => {
  let copyCommandStdOutData = ''
  let copyCommandStdErrData = ''

  console.log('...upload...', filename)
  // закачиваем файл на "сервер"

  const copyCommand = spawn('scp', [filename, "user@192.168.1.2:/www/triton.foundation/www"], { shell: true, cwd: './' });
  copyCommand.stdout.on('data', (data) => {
    console.log(`stdout ${data}`);
    copyCommandStdOutData += data;
  });
  copyCommand.stderr.on('data', (data) => {
    console.log(`stderr ${data}`);
    copyCommandStdErrData += data;
  });
  copyCommand.on('exit', (exitCode, killSignal) => { // отлавливаем окончание работы
    // уведомляем о выполненной задаче
    if (copyCommandStdErrData.length > 0) {
      // тут тогда перекачать
      emitter.emit('upload_data', id, filename)
    } else {
      //  отправка серверу уведомления об окончании работы
      channel.publish("server", `{"id": "${id}", "status": "done"}`)
      spawn('rm', ['-f', filename], { shell: true, cwd: './' });
    }
  })
})

emitter.on('new_link', async () => {
  console.log(" New Link:", isBusy, messages)
  if (!isBusy) { // сервис не занят
    if (messages[0]) { // если есть сообщения - работаем
      let stdOutData = ''; // накопленный результат вывода от скачивалки
      let stdErrData = ''; // накопленные ошибки вывода от скачивалки
      isBusy = true;

      // парсим
      let data;
      try {
        data = JSON.parse(messages[0])
      } catch (error) {
        console.log('Error in JSON:', error)
        messages.shift() // удаляем ошибочное из массива ссылок
        emitter.emit('new_link')
        return
      }

      // выкачиваем
      const child = spawn('yt-dlp', [`-o ${data.id}`, '--force-overwrites', `"${data.url}"`], { shell: true });

      child.stdout.on('data', (data) => {
        console.log(`stdout ${data}`);
        stdOutData += data;
      });
      child.stderr.on('data', (data) => {
        console.log(`stderr ${data}`);
        stdErrData += data;
      });
      child.on('exit', (exitCode, killSignal) => { // отлавливаем окончание работы
        if (exitCode === 0) { // всё хорошо
          if (stdOutData.length > 0) {
            messages.shift() // удаляем выкаченное из массива ссылок

            // разбираем накопленный stdout чтобы получить имя скаченного файла
            const tmp = stdOutData.match(getResultfileNameRegex)
            console.log('...', data.id, '\n', tmp[1])
            emitter.emit('upload_data', data.id, `${data.id}.mp4`)

            isBusy = false // меняем статус
            if (messages.length > 0) { // если ещё остались ссылки - вызываем выкачивалку
              emitter.emit('new_link')
              return
            }
          } else { // что-то пошло не так. Перезапускаем.
            isBusy = false // меняем статус
            emitter.emit('new_link')
            return
          }
        } else { // какая-то ошибка - перезапускаем
          isBusy = false // меняем статус
          messages.shift()
          emitter.emit('new_link')//, isBusy, messages)
          return
        }
      })

    }
  } else {
    // перезапускаем через n минут
  }
})