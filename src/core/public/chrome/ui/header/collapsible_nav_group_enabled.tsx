/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './collapsible_nav_group_enabled.scss';
import {
  EuiCollapsibleNavGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiListGroup,
  EuiListGroupItem,
  EuiShowFor,
  EuiFlyout,
  EuiButtonIcon,
  EuiFlexGroup,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { groupBy, sortBy } from 'lodash';
import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import * as Rx from 'rxjs';
import { ChromeNavLink } from '../..';
import { AppCategory, ChromeNavGroup, NavGroupType } from '../../../../types';
import { InternalApplicationStart } from '../../../application/types';
import { HttpStart } from '../../../http';
import { OnIsLockedUpdate } from './';
import { createEuiListItem } from './nav_link';
import type { Logos } from '../../../../common/types';
import {
  ChromeRegistrationNavLink,
  CollapsibleNavHeaderRender,
  NavGroupItemInMap,
} from '../../chrome_service';

function getAllCategories(allCategorizedLinks: Record<string, ChromeNavLink[]>) {
  const allCategories = {} as Record<string, AppCategory | undefined>;

  for (const [key, value] of Object.entries(allCategorizedLinks)) {
    allCategories[key] = value[0].category;
  }

  return allCategories;
}

const LinkItemType = {
  LINK: 'link',
  CATEGORY: 'category',
} as const;

function getOrderedLinksOrCategories(
  navLinks: ChromeNavLink[]
): Array<
  { order?: number } & (
    | { itemType: 'link'; link: ChromeNavLink }
    | { itemType: 'category'; category?: AppCategory; links?: ChromeNavLink[] }
  )
> {
  const groupedNavLinks = groupBy(navLinks, (link) => link?.category?.id);
  const { undefined: unknowns = [], ...allCategorizedLinks } = groupedNavLinks;
  const categoryDictionary = getAllCategories(allCategorizedLinks);
  return sortBy(
    [
      ...unknowns.map((linkWithoutCategory) => ({
        itemType: LinkItemType.LINK,
        link: linkWithoutCategory,
        order: linkWithoutCategory.order,
      })),
      ...Object.keys(allCategorizedLinks).map((categoryKey) => ({
        itemType: LinkItemType.CATEGORY,
        category: categoryDictionary[categoryKey],
        order: categoryDictionary[categoryKey]?.order,
        links: allCategorizedLinks[categoryKey],
      })),
    ],
    (item) => item.order
  );
}

function getCategoryLocalStorageKey(id: string) {
  return `core.newNav.navGroup.${id}`;
}

function getIsCategoryOpen(id: string, storage: Storage) {
  const value = storage.getItem(getCategoryLocalStorageKey(id)) ?? 'true';

  return value === 'true';
}

function setIsCategoryOpen(id: string, isOpen: boolean, storage: Storage) {
  storage.setItem(getCategoryLocalStorageKey(id), `${isOpen}`);
}

interface Props {
  appId$: InternalApplicationStart['currentAppId$'];
  basePath: HttpStart['basePath'];
  collapsibleNavHeaderRender?: CollapsibleNavHeaderRender;
  id: string;
  isLocked: boolean;
  isNavOpen: boolean;
  navLinks$: Rx.Observable<ChromeNavLink[]>;
  storage?: Storage;
  onIsLockedUpdate: OnIsLockedUpdate;
  closeNav: () => void;
  navigateToApp: InternalApplicationStart['navigateToApp'];
  navigateToUrl: InternalApplicationStart['navigateToUrl'];
  customNavLink$: Rx.Observable<ChromeNavLink | undefined>;
  logos: Logos;
  navGroupsMap$: Rx.Observable<Record<string, NavGroupItemInMap>>;
}

interface NavGroupsProps {
  logos: Logos;
  storage: Storage;
  navLinks: ChromeNavLink[];
  readyForEUI: any;
  suffix?: React.ReactElement;
  style?: React.CSSProperties;
}

function NavGroups({ navLinks, logos, storage, readyForEUI, suffix, style }: NavGroupsProps) {
  const orderedLinksOrCategories = getOrderedLinksOrCategories(navLinks);
  return (
    <EuiFlexItem className="eui-yScroll" style={style}>
      {/* OpenSearchDashboards, Observability, Security, and Management sections */}
      {orderedLinksOrCategories.map((linkOrCategory) => {
        if (linkOrCategory.itemType === LinkItemType.CATEGORY) {
          const category = linkOrCategory.category as AppCategory;
          const opensearchLinkLogo =
            category?.id === 'opensearchDashboards' ? logos.Mark.url : category.euiIconType;

          return (
            <EuiCollapsibleNavGroup
              key={category.id}
              iconType={opensearchLinkLogo}
              title={category.label}
              isCollapsible={true}
              initialIsOpen={getIsCategoryOpen(category.id, storage)}
              onToggle={(isCategoryOpen) => setIsCategoryOpen(category.id, isCategoryOpen, storage)}
              data-test-subj={`collapsibleNavGroup-${category.id}`}
              data-test-opensearch-logo={opensearchLinkLogo}
            >
              <EuiListGroup
                aria-label={i18n.translate('core.ui.primaryNavSection.screenReaderLabel', {
                  defaultMessage: 'Primary navigation links, {category}',
                  values: { category: category.label },
                })}
                listItems={linkOrCategory.links?.map((link) => readyForEUI(link))}
                maxWidth="none"
                color="subdued"
                gutterSize="none"
                size="s"
              />
            </EuiCollapsibleNavGroup>
          );
        }

        return (
          <EuiCollapsibleNavGroup isCollapsible={false}>
            <EuiListGroup flush>
              <EuiListGroupItem color="text" size="s" {...readyForEUI(linkOrCategory.link, true)} />
            </EuiListGroup>
          </EuiCollapsibleNavGroup>
        );
      })}
      {suffix}
    </EuiFlexItem>
  );
}

function fullfillRegistrationLinksToChromeNavLinks(
  registerNavLinks: ChromeRegistrationNavLink[],
  navLinks: ChromeNavLink[]
): Array<ChromeNavLink & { order?: number }> {
  const allExistingNavLinkId = navLinks.map((link) => link.id);
  return (
    registerNavLinks
      ?.filter((navLink) => allExistingNavLinkId.includes(navLink.id))
      .map((navLink) => ({
        ...navLinks[allExistingNavLinkId.indexOf(navLink.id)],
        ...navLink,
      })) || []
  );
}

export function CollapsibleNavGroupEnabled({
  basePath,
  collapsibleNavHeaderRender,
  id,
  isLocked,
  isNavOpen,
  storage = window.localStorage,
  onIsLockedUpdate,
  closeNav,
  navigateToApp,
  navigateToUrl,
  logos,
  ...observables
}: Props) {
  const navLinks = useObservable(observables.navLinks$, []).filter((link) => !link.hidden);
  const customNavLink = useObservable(observables.customNavLink$, undefined);
  const appId = useObservable(observables.appId$, '');
  const navGroupsMap = useObservable(observables.navGroupsMap$, {});
  const lockRef = useRef<HTMLButtonElement>(null);

  const [focusGroup, setFocusGroup] = useState<ChromeNavGroup | undefined>(undefined);

  const [shouldShrinkSecondNavigation, setShouldShrinkSecondNavigation] = useState(false);
  const readyForEUI = (link: ChromeNavLink, needsIcon: boolean = false) => {
    return createEuiListItem({
      link,
      appId,
      dataTestSubj: 'collapsibleNavAppLink',
      navigateToApp,
      onClick: closeNav,
      ...(needsIcon && { basePath }),
    });
  };

  useEffect(() => {
    if (appId) {
      const orderedGroups = sortBy(Object.values(navGroupsMap), (group) => group.order);
      const findMatchedGroup = orderedGroups.find(
        (group) => !!group.navLinks.find((navLink) => navLink.id === appId)
      );
      setFocusGroup(findMatchedGroup);
    }
  }, [appId, navGroupsMap]);

  const secondNavigation = focusGroup ? (
    <>
      {shouldShrinkSecondNavigation ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 16,
          }}
        >
          <EuiButtonIcon
            color="text"
            iconType="menuRight"
            onClick={() => setShouldShrinkSecondNavigation(false)}
          />
        </div>
      ) : null}
      {!shouldShrinkSecondNavigation && (
        <>
          <div className="euiCollapsibleNavGroup euiCollapsibleNavGroup--light euiCollapsibleNavGroup--withHeading">
            <EuiFlexGroup alignItems="center">
              <EuiFlexItem>
                <h3 className="euiAccordion__triggerWrapper euiCollapsibleNavGroup__title">
                  {focusGroup.title}
                </h3>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonIcon
                  color="text"
                  iconType="menuLeft"
                  aria-label="shrink"
                  onClick={() => setShouldShrinkSecondNavigation(true)}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </div>
          <NavGroups
            navLinks={fullfillRegistrationLinksToChromeNavLinks(
              navGroupsMap[focusGroup.id]?.navLinks || [],
              navLinks
            )}
            logos={logos}
            storage={storage}
            readyForEUI={readyForEUI}
          />
        </>
      )}
    </>
  ) : null;

  const secondNavigationWidth = useMemo(() => {
    if (shouldShrinkSecondNavigation) {
      return 48;
    }

    return 320;
  }, [shouldShrinkSecondNavigation]);

  const flyoutSize = useMemo(() => {
    if (focusGroup) {
      return 320 + secondNavigationWidth;
    }

    return 320;
  }, [focusGroup, secondNavigationWidth]);

  const onGroupClick = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    group: ChromeNavGroup
  ) => {
    const fullfilledLinks = fullfillRegistrationLinksToChromeNavLinks(
      navGroupsMap[group.id]?.navLinks,
      navLinks
    );
    const orderedLinksOrCategories = getOrderedLinksOrCategories(fullfilledLinks);
    setFocusGroup(group);
    let firstLink: ChromeNavLink | null = null;
    orderedLinksOrCategories.find((linkOrCategory) => {
      if (linkOrCategory.itemType === LinkItemType.CATEGORY) {
        if (linkOrCategory.links?.length) {
          firstLink = linkOrCategory.links[0];
          return true;
        }
      } else if (linkOrCategory.itemType === LinkItemType.LINK) {
        firstLink = linkOrCategory.link;
        return true;
      }
    });
    if (firstLink) {
      const propsForEui = readyForEUI(firstLink);
      propsForEui.onClick(e);
    }
  };

  const allLinksWithNavGroup = Object.values(navGroupsMap).reduce(
    (total, navGroup) => [...total, ...navGroup.navLinks.map((navLink) => navLink.id)],
    [] as string[]
  );

  return (
    <>
      {isNavOpen || isLocked ? (
        <EuiFlyout
          data-test-subj="collapsibleNav"
          id={id}
          side="left"
          aria-label={i18n.translate('core.ui.primaryNav.screenReaderLabel', {
            defaultMessage: 'Primary',
          })}
          type={isLocked ? 'push' : 'overlay'}
          onClose={closeNav}
          outsideClickCloses={false}
          className="context-nav-wrapper"
          size={flyoutSize}
          closeButtonPosition="outside"
          hideCloseButton={isLocked}
        >
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: 320 }}>
              {customNavLink && (
                <Fragment>
                  <EuiFlexItem grow={false} style={{ flexShrink: 0 }}>
                    <EuiCollapsibleNavGroup
                      background="light"
                      className="eui-yScroll"
                      style={{ maxHeight: '40vh' }}
                    >
                      <EuiListGroup
                        listItems={[
                          createEuiListItem({
                            link: customNavLink,
                            basePath,
                            navigateToApp,
                            dataTestSubj: 'collapsibleNavCustomNavLink',
                            onClick: closeNav,
                            externalLink: true,
                          }),
                        ]}
                        maxWidth="none"
                        color="text"
                        gutterSize="none"
                        size="s"
                      />
                    </EuiCollapsibleNavGroup>
                  </EuiFlexItem>

                  <EuiHorizontalRule margin="none" />
                </Fragment>
              )}

              <NavGroups
                navLinks={navLinks.filter((link) => !allLinksWithNavGroup.includes(link.id))}
                logos={logos}
                storage={storage}
                readyForEUI={readyForEUI}
                suffix={
                  <div>
                    <EuiCollapsibleNavGroup>
                      <EuiListGroup flush>
                        {sortBy(
                          Object.values(navGroupsMap).filter(
                            (item) => item.type === NavGroupType.SYSTEM
                          ),
                          (navGroup) => navGroup.order
                        ).map((group) => {
                          return (
                            <EuiListGroupItem
                              key={group.id}
                              label={group.title}
                              isActive={group.id === focusGroup?.id}
                              onClick={(e) => {
                                if (focusGroup?.id === group.id) {
                                  setFocusGroup(undefined);
                                } else {
                                  onGroupClick(e, group);
                                }
                              }}
                            />
                          );
                        })}
                      </EuiListGroup>
                    </EuiCollapsibleNavGroup>
                    {collapsibleNavHeaderRender && collapsibleNavHeaderRender()}
                    <EuiCollapsibleNavGroup>
                      <EuiListGroup flush>
                        {sortBy(
                          Object.values(navGroupsMap).filter((item) => !item.type),
                          (navGroup) => navGroup.order
                        ).map((group) => {
                          return (
                            <EuiListGroupItem
                              key={group.id}
                              label={group.title}
                              isActive={group.id === focusGroup?.id}
                              onClick={(e) => {
                                if (focusGroup?.id === group.id) {
                                  setFocusGroup(undefined);
                                } else {
                                  onGroupClick(e, group);
                                }
                              }}
                            />
                          );
                        })}
                      </EuiListGroup>
                    </EuiCollapsibleNavGroup>
                    {/* Docking button only for larger screens that can support it*/}
                    <EuiShowFor sizes={['l', 'xl']}>
                      <EuiCollapsibleNavGroup>
                        <EuiListGroup flush>
                          <EuiListGroupItem
                            data-test-subj="collapsible-nav-lock"
                            buttonRef={lockRef}
                            size="xs"
                            color="subdued"
                            label={
                              isLocked
                                ? i18n.translate('core.ui.primaryNavSection.undockLabel', {
                                    defaultMessage: 'Undock navigation',
                                  })
                                : i18n.translate('core.ui.primaryNavSection.dockLabel', {
                                    defaultMessage: 'Dock navigation',
                                  })
                            }
                            aria-label={
                              isLocked
                                ? i18n.translate('core.ui.primaryNavSection.undockAriaLabel', {
                                    defaultMessage: 'Undock primary navigation',
                                  })
                                : i18n.translate('core.ui.primaryNavSection.dockAriaLabel', {
                                    defaultMessage: 'Dock primary navigation',
                                  })
                            }
                            onClick={() => {
                              onIsLockedUpdate(!isLocked);
                              if (lockRef.current) {
                                lockRef.current.focus();
                              }
                            }}
                            iconType={isLocked ? 'lock' : 'lockOpen'}
                          />
                        </EuiListGroup>
                      </EuiCollapsibleNavGroup>
                    </EuiShowFor>
                  </div>
                }
              />
            </div>
            {secondNavigation && (
              <div
                className="second-navigation"
                style={{ width: secondNavigationWidth, overflowY: 'auto', overflowX: 'hidden' }}
              >
                {secondNavigation}
              </div>
            )}
          </div>
        </EuiFlyout>
      ) : null}
      {secondNavigation && !isLocked ? (
        <EuiFlyout
          className="context-nav-wrapper"
          type="push"
          onClose={() => {}}
          size={secondNavigationWidth}
          side="left"
          hideCloseButton
        >
          {secondNavigation}
        </EuiFlyout>
      ) : null}
    </>
  );
}
