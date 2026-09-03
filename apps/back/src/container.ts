import { DatabaseConfig } from './shared/config/database.config'
import { HttpService } from './shared/http/http.service'

// Infrastructure only: the feature modules are plain functions taking the pool they need.
export class ServicesContainer {
  public readonly databaseConfig: DatabaseConfig
  public readonly httpService: HttpService

  constructor() {
    this.databaseConfig = new DatabaseConfig('SERVICE_DB')
    this.httpService = new HttpService()
  }
}

export const servicesContainer = new ServicesContainer()
