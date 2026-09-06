import { Component } from "@tiny-aster/core";

/** @public */
export interface LootTableComponent extends Component {
    type: "LootTable";
    tableId: string;
}

/** @public */
export interface PowerUpComponent extends Component {
    type: "PowerUp";
    powerUpType: string;
}
