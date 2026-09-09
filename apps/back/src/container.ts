import { DatabaseConfig } from './shared/config/database.config'

export class ServicesContainer {
  public readonly databaseConfig: DatabaseConfig

  constructor() {
    this.databaseConfig = new DatabaseConfig('SERVICE_DB')
  }
}

export const servicesContainer = new ServicesContainer()
