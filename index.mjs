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

// let pathToStoreFiles = './' // путь, где будут лежать скаченные файлы


// main
/* Это для общения с кожанным
bot.on(['/start', '/hello'], async (msg) => {
    let message = {};
	message.userID = msg.from.id;
	message.firstName = msg.from.first_name;
	message.lastName = msg.from.last_name;
	message.userName = msg.from.username; // ник
	message.messageDate = msg.date;
	message.messageText = msg.text;
	message.messageChat = msg.chat.id;

    const { users } = db.data;
    const userData =  users.find((users) => users.tgId === message.userID);
    const today = new Date();
    if (!userData) { // новый пользователь
        await db.update(({ users }) => users.push({
            tgId: message.userID,
            firstName: message.firstName,
            lastName: message.lastName,
            userName: message.userName,
            registeredAt: today,
            lastAccessAt: today
        }))
        msg.reply.text('Welcome!')
    } else { //уже зареганый
        userData.lastAccessAt = today
        db.update((userData) => {})
        msg.reply.text('Again')
    }

})
*/
emitter.on('upload_data', (id, filename) => {
    // закачиваем файл на "сервер"
    const copyCommand = spawn('scp', [`"${filename}"`, "rom@192.168.1.3:/tmp"], { shell: true });
    copyCommand.stdout.on('data', (data) => {
        console.log(`stdout ${data}`);
        copyCommandStdOutData += data;
    });
    chchildild.stderr.on('data', (data) => {
        console.log(`stderr ${data}`);
        copyCommandStdErrData += data;
    });
    // уведомляем о выполненной задаче
    if (copyCommandStdErrData.length > 0) {
        // тут тогда перекачать
        emitter.emit('upload_data', id, filename)
    } else {
        bot.sendMessage(`{"id":"${id}", "status":"done"}`)
    }
})


emitter.on('new_link', async (msg) => {
    if (!isBusy) { // сервис не занят
        if (messages[0]) { // если есть сообщения - работаем
            let stdOutData = ''; // накопленный результат вывода от скачивалки
            let stdErrData = ''; // накопленные ошибки вывода от скачивалки
            isBusy = true;
            
            // парсим
            let data;
            try {
                data = JSON.parse(msg)
            } catch( error) {
                console.log('Error in JSON:', msg, error)
                messages.shift() // удаляем ошибочное из массива ссылок
                emitter.emit('new_link', isBusy, messages)
                return
            }

            // выкачиваем
            const child = spawn('yt-dlp', [`"${data.url}"`], { shell: true });
            
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
                    
                    if (stdOutData.lenth > 0) {
                        messages.shift() // удаляем выкаченное из массива ссылок
                    } else {
                        emitter.emit('new_link', isBusy, messages)
                        isBusy = false // меняем статус
                        return
                    }

                    isBusy = false // меняем статус
                    if (messages.length > 0) { // если ещё остались ссылки - вызываем выкачивалку
                        // здесь специально вызывам до окончания всей работы. Нода асинхронная - может работать ||                     
                        emitter.emit('new_link', isBusy, messages)
                    }

                    // разбираем накопленный stdout чтобы получить имя скаченного файла
                    const tmp = stdOutData.match(getResultfileNameRegex)
                    emitter.emit('upload_data', (msg.id, tmp[1]))
                    
                } else { // какая-то ошибка - перезапускаем
                    emitter.emit('new_link', isBusy, messages)
                }
            })
            
            
        }
    }
})


// Это для общения роботов
bot.on(/.*youtube.com\/.*/, (msg) => {
    // return msg.reply.photo('http://thecatapi.com/api/images/get');
    console.log(msg.text)
    messages.push(msg.text)
    emitter.emit('new_link', msg.text)
});

bot.start()
/*
    структура запроса:
    id - идентификатор на "сервере"
    url - url на видео
*/

//!!!! TODO: получить название скаченного видео