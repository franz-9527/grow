// Vinext beta calls process.exit(0) immediately after prerendering. On Windows
// Node 24 this can terminate native worker handles while libuv is closing them.
// Let successful builds drain naturally; preserve every nonzero failure exit.
if (process.platform === 'win32') {
  const exit = process.exit.bind(process);
  process.exit = (code = 0) => {
    if (Number(code) === 0) {
      process.exitCode = 0;
      return;
    }
    return exit(code);
  };
}
