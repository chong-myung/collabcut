// Sample test to verify Jest setup
describe('Jest Setup', () => {
  test('should be able to run tests', () => {
    expect(1 + 1).toBe(2);
  });

  test('should have access to test utils', () => {
    expect(global.testUtils).toBeDefined();
    expect(global.testUtils.delay).toBeDefined();
  });

  test('should have electron mocked', () => {
    expect(global.testUtils.mockElectron).toBeDefined();
    expect(global.testUtils.mockElectron.app).toBeDefined();
  });
});
