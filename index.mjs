// FAQ: https://www.reddit.com/user/krimsen/comments/uzpaaq/ytdlp_faq_and_basic_operation_tips_and_tricks/

const TELEGRAM_BOT_TOKEN = '497682600:AAEvCZCHXlRDM-lS3QHm571FID6d5_r3gsw'

import TeleBot from "telebot";
import { spawn } from "child_process"
import EventEmitter from "events";

// import db from "./models/index.cjs"
// import { JSONFilePreset } from 'lowdb/node' // https://github.com/typicode/lowdb

// const dbt = await db.JSONFilePreset('./db.json', { posts: [] })
// console.log(db)

// Read or create db.json
// const defaultData = { users: [] }
// const db = await JSONFilePreset('db.json', defaultData)

// init
const bot = new TeleBot({
    token: TELEGRAM_BOT_TOKEN,
})
const getResultfileNameRegex = /file\s+(.+?\.mp4)/;// /.*file (.*\.mp4)/gm

const messages = [];
const emitter = new EventEmitter();
let isBusy = false;

// main
emitter.on('upload_data', (id, filename) => {
    let copyCommandStdOutData = ''
    let copyCommandStdErrData = ''

    console.log('...upload...', filename)
    // закачиваем файл на "сервер"
    const copyCommand = spawn('scp', [filename, "user@192.168.1.2:/tmp"], { shell: true, cwd: './' });
    copyCommand.stdout.on('data', (data) => {
        console.log(`stdout ${data}`);
        copyCommandStdOutData += data;
    });
    copyCommand.stderr.on('data', (data) => {
        console.log(`stderr ${data}`);
        copyCommandStdErrData += data;
    });
    // уведомляем о выполненной задаче
    if (copyCommandStdErrData.length > 0) {
        // тут тогда перекачать
        emitter.emit('upload_data', id, filename)
    } else {
        bot.sendMessage('-1002238341419',`{"id":"${id}", "status":"done"}`) // первый параметр - чат куда слать уведомления
    }
})

emitter.on('new_link', async () => {
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
            // console.log(`-o ${data.id}.%(ext)s`); process.exit(1)
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
                    emitter.emit('new_link')//, isBusy, messages)
                    return
                }
            })

        }
    } else {
        // перезапускаем через n минут
    }
})

//test
bot.on('message', (msg) => {
    console.log(msg)
})

// Это для общения роботов
bot.on(/.*youtube.com\/.*/, (msg) => {
    // return msg.reply.photo('http://thecatapi.com/api/images/get');
    console.log(msg)
    messages.push(msg.text)
    emitter.emit('new_link')
});

bot.start()
/*
    структура запроса:
    id - идентификатор на "сервере"
    url - url на видео
*/
