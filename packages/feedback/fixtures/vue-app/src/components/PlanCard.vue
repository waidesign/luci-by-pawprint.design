<script setup>
defineProps({
  name: String,
  price: String,
  featured: Boolean
});
</script>

<template>
  <div class="plan">
    <h2>{{ name }}</h2>
    <p :class="featured ? 'pulse' : undefined">{{ price }} per month</p>
    <button type="button">Start free trial</button>
  </div>
</template>
