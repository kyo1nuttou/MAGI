# MAGI SYSTEM

3つのAI人格が、相談内容をそれぞれの判断基準で分析し、「承認」または「否定」を提出するローカルWebアプリです。最終決議は全員が承認したときのみ「可決」、それ以外は「否決」です。

- ROMANTIC: ロマンチストとしての人格
- RATIONAL: 理性としての人格
- ENTERTAINER: エンターテイナーとしての人格

各人格カードには `public/assets/wireframe-man.fbx` の3Dモデルを割り当てています。Three.js関連ファイルは `public/vendor/three` に同梱しているため、localhost上で表示できます。

## 起動

```bash
node server.js
```

ブラウザで `http://localhost:4173` を開きます。

`npm` が使える環境なら、次でも起動できます。

```bash
npm start
```

## OpenAI APIを使う

APIキーを環境変数に入れて起動します。キーはブラウザへ送られず、`server.js` の中だけで使われます。

```bash
OPENAI_API_KEY=sk-... node server.js
```

モデルを変えたい場合:

```bash
OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-5.4-mini node server.js
```

APIキーがない場合は、画面確認用のデモ判定で動きます。

`.env` に書くこともできます。

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
```

`.env.example` を `.env` にコピーして、`OPENAI_API_KEY` を自分のキーに置き換えてください。

```bash
cp .env.example .env
```

`.env` の例:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
```

`.env` は `.gitignore` で除外しています。APIキーをGitHubにpushしないため、そのままで大丈夫です。

## 共有する相手の手順

```bash
git clone https://github.com/kyo1nuttou/MAGI.git
cd MAGI
cp .env.example .env
```

`.env` に自分のOpenAI APIキーを入れてから起動します。

```bash
node server.js
```

APIキーがない場合はデモ判定で動きます。
