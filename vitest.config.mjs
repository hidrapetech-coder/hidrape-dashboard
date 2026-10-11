export default {
    envDir: false,
    cacheDir: './node_modules/.cache/vitest',
    test: { include: ['tests/**/*.test.js'], setupFiles:['./tests/offlineSetup.js'], testTimeout:10000 }
};
