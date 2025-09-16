module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/main/src'],
  testMatch: ['**/__tests__/**/*.test.(ts|js)', '**/tests/**/*.test.(ts|js)'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  collectCoverageFrom: ['main/src/**/*.{ts,js}', '!main/src/**/*.d.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/main/src/$1',
  },
  testTimeout: 30000, // Increased timeout for integration tests
  transformIgnorePatterns: ['node_modules/(?!(uuid)/)'],
};
