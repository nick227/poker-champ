You need three layers of components:

Primitive (pure reusable UI atoms)

Composite (domain-shaped building blocks)

Layout/Screen Compositions (structural containers)

Each component must have one reason to change.

Below is a clean SRP-based proposal.

1️⃣ Base / Primitive Components (Pure UI Atoms)

These never know about poker.

Typography

Text

Heading

Label

MutedText

Buttons

Button

IconButton

ChipButton

SegmentedButton

ConfirmButton (specialized confirm style)

Inputs

TextInput

PasswordInput

Select

Toggle

Slider

NumberInput

Feedback

Badge

Pill

StatusDot

Divider

Loader

ProgressBar

Layout Primitives

Row

Column

Stack

Spacer

Card

Panel

Screen

2️⃣ Core Reusable Structural Components

These shape the app but are not poker-specific.

Navigation / Shell

AppShell

TopBar

Masthead

BottomNav

ModalSheet

Popup

ConfirmDialog

Lists

DataTable

DataTableRow

DataTableHeader

List

ListItem

EmptyState

Account / Profile

Avatar

UserIdentityStrip

AccountCard

BankrollDisplay

StatusSummary

Generic Stat Components

StatRow

StatChip

MetricPill

MetricStrip

3️⃣ Lobby Domain Components

Specific to Lobby logic.

Layout

LobbyLayout

LobbyHeader

LobbyControls

GameList

Game List

GameTable

GameTableRow

GameTableHeader

JoinButton

RegisterButton

GameStatusBadge

Modals

CreateGameModal

JoinGameModal

BuyInModal

4️⃣ Table Domain Components (Poker-Specific)

These are compositional pieces of the table.

Player / Avatar System

PlayerAvatar

PlayerStack

PlayerBetBadge

PlayerStatusBadge

DealerButtonIndicator

ActiveTurnRing

Composite:

PlayerSeat

Opponent Strip

OpponentStrip

OpponentRow

OpponentSeatGroup

Board Area

Card

CardBack

CardRow

CommunityBoard

PotDisplay

SidePotDisplay

PotChipStack

Hero Zone

HeroSeat

HeroCardRow

HeroStackDisplay

HeroAvatar

Calculations Layer

CalculationsStrip

MetricPill

EquityPill

PotOddsPill

OutsPill

Dealer Layer

DealerAnnounceBar

DealerMessage

HandResultOverlay

Action System

ActionBar

PrimaryActionRow

BetSliderRow

QuickAmountRow

ActionStatusText

FoldButton

CallButton

RaiseButton

Multi-Table

MinimizedTableNotification

ActiveTablesPicker

TableNotificationBadge

5️⃣ Screen-Level Compositions

These are full compositions.

LobbyScreen

TableScreen

LoginScreen

SettingsScreen

LoadingScreen

Each composes domain + core components.

6️⃣ Registry-Friendly Component Types

Since you are registry-driven:

Registry-Aware Components

RegistryPanelRenderer

RegistryActionRenderer

RegistryScreenRenderer

These accept:

key → definition → render

7️⃣ State / Interaction Containers

These connect UI to store.

TableContainer

LobbyContainer

ActionContainer

RealtimeContainer

UI components remain dumb.

8️⃣ Animation / Transition Components

Keep separate:

FadeTransition

SlideUpPanel

RotateLoadingScreen

ChipFlyAnimation

CardFlip

9️⃣ Notification System

Toast

ToastContainer

AlertBanner

TableNotificationBell

10️⃣ File Structure Proposal
components/
  base/
  core/
  lobby/
  table/
  overlays/
  animations/

3) Layout / Screen Containers

Reason to change: page structure only

App Level
AppShell
AppHeader
AppFooter
AppBody

Standard Pages
PageLayout
PageHeader
PageBody
PageFooter

Table-Style Pages
StageLayout
StageTop
StageCenter
StageBottom

Modal Flows
FlowLayout
FlowHeader
FlowBody
FlowFooter

MVP Assembly Example
Lobby
PageLayout
  PageHeader
    AvatarLabel
    PrimaryActions
    ValueRow (bankroll)
  PageBody
    DataList
      DataRow

Table (Full Screen)
StageLayout
  StageTop
    AvatarRow
  StageCenter
    AnnouncementBar
    CardRow
    StatRow
  StageBottom
    StatusText
    PrimaryActions
    SliderField
    QuickActions

What We Intentionally Skip for MVP

No fancy grids

No mega layout system

No over-specialized components

No deep theming abstractions