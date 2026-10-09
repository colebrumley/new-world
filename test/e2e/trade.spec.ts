import { expect, test } from '@playwright/test';
import { field, foundJamestown } from './helpers';

test('creates a trade route from the Trade menu and puts the caravel on it', async ({ page }) => {
  await foundJamestown(page);
  await page.keyboard.press('Escape'); // leave the colony screen
  const dialog = page.getByRole('dialog');

  await page.keyboard.press('t');
  await expect(field(page, 'status')).toContainText('No trade routes are defined');

  await page.keyboard.press('Alt+t');
  await expect(dialog.getByRole('button')).toHaveText(['Create Trade Route', 'Edit Trade Route', 'Delete Trade Route', 'Cancel']);
  await dialog.getByRole('button', { name: 'Create Trade Route' }).click();
  await dialog.getByRole('button', { name: 'Jamestown' }).click();
  await dialog.getByRole('button', { name: 'Sea route' }).click();

  const editor = page.getByRole('dialog', { name: 'New Trade Route' });
  await expect(editor.getByLabel('Name')).toHaveValue('Jamestown Run');
  await expect(editor.getByLabel('Destination 1')).toHaveValue(/.+/);
  await expect(editor.getByLabel('Destination 2')).toHaveValue('');
  await editor.getByLabel('Unload at stop 1', { exact: true }).selectOption(['tools', 'muskets']);
  await editor.getByLabel('Load at stop 1', { exact: true }).selectOption(['furs']);
  await editor.getByLabel('Name').fill('Fur Run');
  await editor.getByRole('button', { name: 'Save route' }).click();
  await expect(editor).toHaveCount(0);

  // bring up the caravel and begin the route
  await expect(field(page, 'unit')).toHaveText('Pioneer');
  await page.keyboard.press('w');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await page.keyboard.press('t');
  await expect(dialog.getByRole('button')).toHaveText(['Fur Run', 'Cancel']);
  await dialog.getByRole('button', { name: 'Fur Run' }).click();
  // the ship sails into Jamestown under its new orders, so someone else asks for orders now
  await expect(field(page, 'unit')).not.toHaveText('Caravel');

  // the route can be edited and deleted
  await page.keyboard.press('Alt+t');
  await dialog.getByRole('button', { name: 'Edit Trade Route' }).click();
  await dialog.getByRole('button', { name: 'Fur Run' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Trade Route' });
  await expect(edit.getByLabel('Unload at stop 1', { exact: true })).toHaveValues(['tools', 'muskets']);
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await page.keyboard.press('Alt+t');
  await dialog.getByRole('button', { name: 'Delete Trade Route' }).click();
  await dialog.getByRole('button', { name: 'Fur Run' }).click();
  await page.keyboard.press('Alt+t');
  await dialog.getByRole('button', { name: 'Edit Trade Route' }).click();
  await expect(field(page, 'status')).toHaveText('No trade routes are defined.');
});
