import { Restaurant } from '../../domain/models/Restaurant';
import { IRestaurantRepository } from '../../domain/repositories/IRestaurantRepository';
import { prisma } from '../db/prisma';

export class PrismaRestaurantRepository implements IRestaurantRepository {
  async findBySlug(slug: string): Promise<Restaurant | null> {
    const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
    return restaurant as Restaurant | null;
  }

  async findById(id: string): Promise<Restaurant | null> {
    const restaurant = await prisma.restaurant.findUnique({ where: { id } });
    return restaurant as Restaurant | null;
  }

  async update(restaurant: Restaurant): Promise<Restaurant> {
    const updated = await prisma.restaurant.upsert({
      where: { id: restaurant.id },
      update: {
        slug: restaurant.slug,
        name: restaurant.name,
        logoBase64: restaurant.logoBase64,
        themeColor: restaurant.themeColor,
        adminThemeColor: restaurant.adminThemeColor,
        welcomeMessage: restaurant.welcomeMessage,
        description: restaurant.description,
        address: restaurant.address,
        neighborhood: restaurant.neighborhood,
        city: restaurant.city,
        heroImageBase64: restaurant.heroImageBase64,
        fontFamily: restaurant.fontFamily,
        borderRadius: restaurant.borderRadius,
        isDarkMode: restaurant.isDarkMode,
        categoryNavStyle: restaurant.categoryNavStyle,
        heroStyle: restaurant.heroStyle,
        instagramUrl: restaurant.instagramUrl,
        facebookUrl: restaurant.facebookUrl,
        tiktokUrl: restaurant.tiktokUrl,
        whatsappPhone: restaurant.whatsappPhone,
        couponsEnabled: restaurant.couponsEnabled,
        deliveryConfig: restaurant.deliveryConfig ? JSON.parse(JSON.stringify(restaurant.deliveryConfig)) : undefined,
        estimatedDeliveryTime: restaurant.estimatedDeliveryTime,
        minimumOrderAmount: restaurant.minimumOrderAmount,
        schedule: restaurant.schedule ? JSON.parse(JSON.stringify(restaurant.schedule)) : undefined,
        titleEffect: restaurant.titleEffect,
      },
      create: {
        id: restaurant.id,
        slug: restaurant.slug,
        name: restaurant.name,
        logoBase64: restaurant.logoBase64,
        themeColor: restaurant.themeColor,
        adminThemeColor: restaurant.adminThemeColor,
        welcomeMessage: restaurant.welcomeMessage,
        description: restaurant.description,
        address: restaurant.address,
        neighborhood: restaurant.neighborhood,
        city: restaurant.city,
        heroImageBase64: restaurant.heroImageBase64,
        fontFamily: restaurant.fontFamily,
        borderRadius: restaurant.borderRadius,
        isDarkMode: restaurant.isDarkMode,
        categoryNavStyle: restaurant.categoryNavStyle,
        heroStyle: restaurant.heroStyle,
        instagramUrl: restaurant.instagramUrl,
        facebookUrl: restaurant.facebookUrl,
        tiktokUrl: restaurant.tiktokUrl,
        whatsappPhone: restaurant.whatsappPhone,
        couponsEnabled: restaurant.couponsEnabled,
        deliveryConfig: restaurant.deliveryConfig ? JSON.parse(JSON.stringify(restaurant.deliveryConfig)) : undefined,
        estimatedDeliveryTime: restaurant.estimatedDeliveryTime,
        minimumOrderAmount: restaurant.minimumOrderAmount,
        schedule: restaurant.schedule ? JSON.parse(JSON.stringify(restaurant.schedule)) : undefined,
        titleEffect: restaurant.titleEffect,
      }
    });
    return updated as Restaurant;
  }
}
