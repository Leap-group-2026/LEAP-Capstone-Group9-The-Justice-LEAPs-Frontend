import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MainLayout } from './main-layout';

describe('MainLayout profile menu', () => {
  let fixture: ComponentFixture<MainLayout>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [MainLayout],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    fixture = TestBed.createComponent(MainLayout);
    fixture.autoDetectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const toggle = () => el().querySelector<HTMLButtonElement>('button.profile')!;
  const menu = () => el().querySelector('#profile-menu');

  async function openMenu(): Promise<void> {
    toggle().click();
    await fixture.whenStable();
    expect(menu()).not.toBeNull();
  }

  it('opens and closes from its own button', async () => {
    await openMenu();
    toggle().click();
    await fixture.whenStable();
    expect(menu()).toBeNull();
  });

  it('closes when you click anywhere else on the page', async () => {
    await openMenu();

    document.body.click();
    await fixture.whenStable();

    expect(menu()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when you click elsewhere inside the layout, like the sidebar', async () => {
    await openMenu();

    (el().querySelector('.header-title') ?? el().querySelector('header')!).dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await fixture.whenStable();

    expect(menu()).toBeNull();
  });

  it('stays open when clicking inside the menu itself', async () => {
    await openMenu();

    menu()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();

    expect(menu()).not.toBeNull();
  });

  it('closes on Escape and returns focus to the button', async () => {
    await openMenu();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });
});
