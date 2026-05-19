// 将 Tauri Linux 二进制文件打包为 tar.gz
// 在 tauri build 之后运行

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const releaseDir = path.join(__dirname, '..', 'src-tauri', 'target', 'release');
const bundleDir = path.join(releaseDir, 'bundle');

if (!fs.existsSync(bundleDir)) {
  console.log('bundle 目录不存在，跳过 tar.gz 打包');
  process.exit(0);
}

// 查找二进制文件
const bins = fs.readdirSync(bundleDir).filter(f => {
  const full = path.join(bundleDir, f);
  return fs.statSync(full).isDirectory() && f.endsWith('.AppDir');
});

// 或者直接找 release 目录下的二进制
const binaryName = 'pomodoro-timer';
const binaryPath = path.join(releaseDir, binaryName);

if (fs.existsSync(binaryPath)) {
  const tarName = `pomodoro-timer_2.0.0_amd64.tar.gz`;
  const tarPath = path.join(bundleDir, tarName);

  console.log(`创建 tar.gz: ${tarName}`);
  try {
    execSync(`tar -czf "${tarPath}" -C "${releaseDir}" "${binaryName}"`, {
      stdio: 'inherit',
      cwd: releaseDir
    });
    console.log(`完成: ${tarPath}`);
  } catch (err) {
    // Windows 可能没有 tar 命令，跳过
    console.log('tar 命令不可用，请在 Linux 环境下执行此脚本');
  }
} else {
  console.log(`未找到二进制文件: ${binaryPath}`);
}
