import { test, expect } from '@playwright/test';

test.describe('CollabCut Application', () => {
  test('should load the main window', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/CollabCut/);
  });

  test('should display welcome message', async ({ page }) => {
    await page.goto('/');

    // Wait for React to render
    await page.waitForSelector('[data-testid="app"]', { timeout: 10000 });

    // Check for welcome content
    await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible();
  });

  test('should be able to create a new project', async ({ page }) => {
    await page.goto('/');

    // Click create project button
    await page.click('[data-testid="create-project-btn"]');

    // Fill in project details
    await page.fill('[data-testid="project-name-input"]', 'Test Project');
    await page.fill(
      '[data-testid="project-description-input"]',
      'A test project'
    );

    // Submit form
    await page.click('[data-testid="project-submit-btn"]');

    // Verify project was created
    await expect(page.locator('[data-testid="project-title"]')).toContainText(
      'Test Project'
    );
  });

  test('should handle navigation between views', async ({ page }) => {
    await page.goto('/');

    // Navigate to media library
    await page.click('[data-testid="nav-media"]');
    await expect(page.locator('[data-testid="media-library"]')).toBeVisible();

    // Navigate to timeline
    await page.click('[data-testid="nav-timeline"]');
    await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  });
});
