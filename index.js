const fs = require('fs');
const util = require('util');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

if (process.argv.length <= 2) {
  console.log('引数にテキストファイルのパスを指定してください。');
  process.exit(1);
}

const paths = process.argv.slice(2);
console.log(paths);

/// text2mp3 は入力された文字列をGCPのCloudTTSに投げて音声に変換します
/// 各種設定は個人的に聞きやすい設定にしています。
/// 速度はプレイヤー側で調整するので等倍です。
const text2mp3 = async text => {
  if (text.length >= 5000) {
    throw new Error('5000文字以内の文字列のみ変換できます');
  }
  const client = new TextToSpeechClient();
  const req = {
    audioConfig: {
      audioEncoding: 'MP3',
      pitch: -2.0,
      speakingRate: 1.0,
    },
    input: { text },
    voice: { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-D' },
  };
  const [res] = await client.synthesizeSpeech(req);
  return res.audioContent;
};

/// splitTextToNChars は入力文字列をだいたいn文字毎に分割します。
/// 行の途中で分割されないようにn文字以内に収めています。
const splitTextToNChars = (text, n) => {
  const sentences = [];
  let lines = text
    .replace(/\r?\n/g, '\n')
    .replace(/\n+/g, '\n')
    .split('\n');

  let sentence = '';
  while (lines.length > 0) {
    const line = lines.shift();
    if (sentence.length + line.length < n) {
      sentence = sentence.concat('\n').concat(line);
    } else {
      sentences.push(sentence);
      sentence = line;
    }
  }
  sentences.push(sentence);

  return sentences;
};

const main = async () => {
  for (const path of paths) {
    const filename = path.replace(/\..*$/, '');
    const text = await readFile(path, { encoding: 'utf8' });
    const sentences = splitTextToNChars(text, 4800);
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      console.log(sentence);
      const mp3 = await text2mp3(sentence);
      const seq = i.toString().padStart(3, '0');
      const mp3FileName = `${filename}-${seq}.mp3`;
      await writeFile(mp3FileName, mp3, 'binary');
      console.log(`output ${mp3FileName}`);
    }
  }
};

main().catch(console.error);
