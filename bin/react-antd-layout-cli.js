#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import request from 'request';
import { fileURLToPath } from 'url';
import { templateAllFile } from './templateAllFile.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function deleteFolder(filePath) {
  let files = [];
  if (fs.existsSync(filePath)) {
    files = fs.readdirSync(filePath);
    files.forEach(one => {
      let currentPath = path.resolve(filePath, one);
      if (fs.statSync(currentPath).isDirectory()) {
        deleteFolder(currentPath);
      } else {
        fs.unlinkSync(currentPath);
      }
    });
    fs.rmdirSync(filePath);
  }
}
const { projectName } = await inquirer.prompt([
  {
    name: 'projectName',
    type: 'input',
    message: 'react项目名称',
  },
]);
let projectPath = path.resolve(process.cwd(), './' + projectName);
let exist = fs.existsSync(projectPath);
if (exist) {
  const { isCover } = await inquirer.prompt([
    { type: 'confirm', name: 'isCover', message: `目录下已存在${projectName}，是否覆盖` },
  ]);
  if (isCover) {
    deleteFolder(projectPath);
    fs.mkdirSync(projectPath);
  }
} else {
  fs.mkdirSync(projectPath);
}

// 首先获取模板的所有目录结构
let templateFolders = [];

function _request(url) {
  return new Promise((resolve, reject) => {
    request(
      {
        url: url,
        method: 'GET',
        headers: {
          Authorization:
            'token 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',
          'user-agent': 'lishengqin-Octocat-reactLayoutCli',
        },
      },
      function (err, response, body) {
        if (!err && response.statusCode == 200) {
          return resolve(body);
        } else {
          return reject(err);
        }
      }
    );
  });
}
function base64ToString(b64) {
  return new Buffer.from(b64, 'base64').toString();
}
async function deepGet(list) {
  try {
    list = JSON.parse(list);
    list.forEach(one => {
      let obj = {
        name: one.name,
        path: one.path,
        url: one.url,
        type: one.type, // dir file
      };
      templateFolders.push(obj);
    });
    let PromiseAll = list
      .filter(one => one.type === 'dir')
      .map(one => one.url)
      .map(one => _request(one));
    let _list = await Promise.all(PromiseAll);
    for (let i = 0; i < _list.length; i++) {
      await deepGet(_list[i]);
    }
  } catch (e) {
    console.log(chalk.red(e));
  }
}
async function getFolder() {
  // 获取模板所有的目录和文件
  console.log('正在获取项目模板...');
  let folderLevel1 = await _request(
    'https://api.github.com/repos/lishengqin/react-antd-admin/contents'
  );
  await deepGet(folderLevel1);
}
let errorRequestCount = 0;
async function createProject() {
  try {
    /* 请求太慢，直接读取文件中的目录 */
    // await getFolder();
    templateFolders = templateAllFile;
    /* 请求文件内容 */
    console.log('正在请求 https://github.com/lishengqin/react-antd-admin 项目的模板内容...');
    await getFileContent();
    console.log(chalk.green('\n项目创建成功！'));
    console.log(`
  cd ${projectName}
  初始化：npm install
  启动接口node服务：npm run service
  启动项目服务：npm run dev`);
  } catch (e) {}
}
async function getFileContent(list = templateFolders) {
  if (!list.length) {
    return;
  }
  /* 重复请求超过3次就直接提示仓库克隆项目 */
  if (errorRequestCount > 3 && list.length) {
    console.log(chalk.red('github请求项目模板内容超时'));
    console.log(
      chalk.blue('可以直接克隆仓库项目，地址：https://github.com/lishengqin/react-antd-admin')
    );
    return Promise.reject('github请求项目模板内容超时');
  }
  errorRequestCount++;
  let errorRequestFiles = [];
  for (let i = 0; i < list.length; i++) {
    let one = list[i];
    if (one.type === 'file') {
      // 获取type为file的文件内容
      try {
        if (errorRequestCount > 1) {
          console.log(chalk.green(one.path + ' 请求该文件成功'));
        }
        let res = await _request(one.url);
        res = JSON.parse(res);
        let content = base64ToString(res.content);
        if (one.name === 'package.json') {
          content = JSON.parse(content);
          content.name = projectName;
          content = JSON.stringify(content, null, 4);
        }
        if (one.name === 'index.html') {
          content = content.replace(/(?<=<title>).*(?=<\/title>)/, projectName);
        }
        fs.writeFileSync(path.resolve(projectPath, one.path), content);
      } catch (e) {
        errorRequestFiles.push(one);
        console.log(chalk.red(one.path + ' 请求该文件内容超时，正在重新请求'));
      }
    } else if (one.type === 'dir') {
      fs.mkdirSync(path.resolve(projectPath, one.path));
    }
  }
  /* 有些请求失败的文件再请求一下 */
  if (errorRequestFiles.length) {
    getFileContent(errorRequestFiles);
  }
}
createProject();
